/**
 * Minimal API + static server for the assistant.
 *
 *   ANTHROPIC_API_KEY=... npm run server          # API on :8791, Vite proxies /api to it
 *   npm run build && npm start                    # also serves dist/ for production
 *   ASSISTANT_MOCK=1 npm run server               # canned streaming replies, no key needed
 */
import Anthropic from '@anthropic-ai/sdk';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { ASSISTANT_MODEL, dynamicSystemPrompt, staticSystemPrompt } from '../src/assistant/prompt';
import type { AssistantContext } from '../src/assistant/prompt';
import { buildSnapshot } from '../src/research';
import type { ResearchSnapshot } from '../src/research';

loadDotEnv();

const PORT = Number(process.env.PORT ?? 8791);
const MODEL = process.env.ASSISTANT_MODEL ?? ASSISTANT_MODEL;
const MOCK = process.env.ASSISTANT_MOCK === '1';
const WEB_SEARCH = process.env.ASSISTANT_WEB_SEARCH === '1';
const HAS_KEY = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const DIST = resolve('dist');
const MAX_BODY = 512 * 1024;
const MAX_TURNS = 20;
const MAX_CHARS = 4_000;

const client = HAS_KEY && !MOCK ? new Anthropic() : null;
const STATIC_PROMPT = staticSystemPrompt();

interface ChatBody {
  messages: { role: 'user' | 'assistant'; content: string }[];
  context: AssistantContext;
}

// --- helpers ---------------------------------------------------------------

function loadDotEnv(): void {
  try {
    if (!existsSync('.env')) return;
    for (const raw of readFileSync('.env', 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    /* ignore a malformed .env; the server still runs */
  }
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseChat(raw: string): ChatBody {
  const data = JSON.parse(raw) as Partial<ChatBody>;
  if (!Array.isArray(data.messages) || data.messages.length === 0) throw new Error('messages must be a non-empty array');
  const messages = data.messages.slice(-MAX_TURNS).map((m) => {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') throw new Error('each message needs a role and string content');
    return { role: m.role, content: m.content.slice(0, MAX_CHARS) };
  });
  if (messages[0].role !== 'user') throw new Error('the first message must come from the user');
  const context = (data.context && typeof data.context === 'object' ? data.context : {}) as AssistantContext;
  return { messages, context };
}

// --- rate limit (per IP, token bucket) --------------------------------------

const buckets = new Map<string, { tokens: number; last: number }>();
const RATE = { capacity: 20, perMs: 60_000 };

function allow(ip: string): boolean {
  const now = Date.now();
  const b = buckets.get(ip) ?? { tokens: RATE.capacity, last: now };
  b.tokens = Math.min(RATE.capacity, b.tokens + ((now - b.last) / RATE.perMs) * RATE.capacity);
  b.last = now;
  if (b.tokens < 1) {
    buckets.set(ip, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(ip, b);
  return true;
}

// --- SSE -------------------------------------------------------------------

type ServerEvent = { type: 'text'; text: string } | { type: 'done'; sources: { title: string; url: string }[]; usage?: unknown } | { type: 'error'; message: string };

function openStream(res: ServerResponse): (e: ServerEvent) => void {
  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
  return (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
}

async function mockReply(body: ChatBody, send: (e: ServerEvent) => void): Promise<void> {
  const plan = body.context.plan;
  const last = body.messages[body.messages.length - 1].content;
  const text = plan
    ? `(Mock reply, no API key configured.) You asked: "${last}". Your plan invests ${(plan.summary.equityWeight * 100).toFixed(0)}% in stocks and ${(plan.summary.fixedIncomeWeight * 100).toFixed(0)}% in bonds, with ${plan.lines.length} positions and a stock ceiling of ${(plan.summary.equityCap * 100).toFixed(0)}% set by ${plan.summary.equityCapReason}. With a real key I would explain this using the rules and sources built into the tool. This is educational, not personalised advice.`
    : `(Mock reply, no API key configured.) You asked: "${last}". Finish the flow to build a plan and I can answer using your own numbers. This is educational, not personalised advice.`;
  for (const word of text.split(' ')) {
    send({ type: 'text', text: `${word} ` });
    await new Promise((r) => setTimeout(r, 18));
  }
  send({ type: 'done', sources: [] });
}

async function chat(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const ip = req.socket.remoteAddress ?? 'unknown';
  if (!allow(ip)) return json(res, 429, { error: 'Too many requests. Try again in a minute.' });

  let body: ChatBody;
  try {
    body = parseChat(await readBody(req));
  } catch (e) {
    return json(res, 400, { error: (e as Error).message });
  }

  const send = openStream(res);
  if (MOCK || !client) {
    if (!MOCK) {
      send({ type: 'error', message: 'The assistant is not configured. Set ANTHROPIC_API_KEY in .env (or run with ASSISTANT_MOCK=1) and restart the server.' });
      res.end();
      return;
    }
    await mockReply(body, send);
    res.end();
    return;
  }

  const messages: Anthropic.MessageParam[] = body.messages.map((m) => ({ role: m.role, content: m.content }));
  const system: Anthropic.TextBlockParam[] = [
    { type: 'text', text: STATIC_PROMPT, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: dynamicSystemPrompt(body.context) },
  ];

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 4096,
    system,
    messages,
    output_config: { effort: 'low' },
    ...(WEB_SEARCH ? { tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }] } : {}),
  });

  req.on('close', () => stream.abort());
  stream.on('text', (delta) => send({ type: 'text', text: delta }));

  try {
    const final = await stream.finalMessage();
    const sources: { title: string; url: string }[] = [];
    for (const block of final.content) {
      if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
        for (const r of block.content) if (r.type === 'web_search_result') sources.push({ title: r.title, url: r.url });
      }
    }
    if (final.stop_reason === 'refusal') send({ type: 'text', text: 'I cannot help with that request here.' });
    send({ type: 'done', sources, usage: final.usage });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) send({ type: 'error', message: 'The API key was rejected. Check ANTHROPIC_API_KEY.' });
    else if (err instanceof Anthropic.RateLimitError) send({ type: 'error', message: 'The model is rate-limited right now. Please try again shortly.' });
    else if (err instanceof Anthropic.APIError) send({ type: 'error', message: `The model returned an error (${err.status}).` });
    else if ((err as Error).name === 'AbortError' || (err as Error).message?.includes('abort')) {
      /* client went away */
    } else send({ type: 'error', message: 'Something went wrong talking to the model.' });
  }
  res.end();
}

// --- research (validated market data) --------------------------------------

const RESEARCH_TTL_MS = 30 * 60_000;
let researchCache: { at: number; snapshot: ResearchSnapshot } | null = null;
let researchInflight: Promise<ResearchSnapshot> | null = null;

async function research(req: IncomingMessage, res: ServerResponse, force: boolean): Promise<void> {
  if (!allow(req.socket.remoteAddress ?? 'unknown')) return json(res, 429, { error: 'Too many requests. Try again in a minute.' });
  if (!force && researchCache && Date.now() - researchCache.at < RESEARCH_TTL_MS) return json(res, 200, researchCache.snapshot);
  // A forced refresh is still limited to once a minute so the public sources are not hammered.
  if (force && researchCache && Date.now() - researchCache.at < 60_000) return json(res, 200, researchCache.snapshot);
  researchInflight ??= buildSnapshot().finally(() => {
    researchInflight = null;
  });
  const snapshot = await researchInflight;
  // Only cache when something usable came back, so a network blip is retried on the next request.
  if (snapshot.indicators.some((i) => i.status !== 'rejected')) researchCache = { at: Date.now(), snapshot };
  json(res, 200, snapshot);
}

// --- static files (production) ---------------------------------------------

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function serveStatic(pathname: string, res: ServerResponse): boolean {
  if (!existsSync(join(DIST, 'index.html'))) return false;
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let file = resolve(DIST, `.${safe}`);
  if (!file.startsWith(DIST)) return false;
  if (!existsSync(file) || safe === '/' || safe === '') file = join(DIST, 'index.html');
  const ext = extname(file);
  res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream', 'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable' });
  res.end(readFileSync(file));
  return true;
}

// --- server ----------------------------------------------------------------

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  try {
    if (url.pathname === '/api/health' && req.method === 'GET') {
      return json(res, 200, { ok: true, configured: Boolean(client) || MOCK, mock: MOCK, model: MODEL, webSearch: WEB_SEARCH });
    }
    if (url.pathname === '/api/research' && req.method === 'GET') return await research(req, res, url.searchParams.has('refresh'));
    if (url.pathname === '/api/chat' && req.method === 'POST') return await chat(req, res);
    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'not found' });
    if (req.method === 'GET' && serveStatic(url.pathname, res)) return;
    json(res, 404, { error: 'not found (run `npm run build` to serve the site from here, or use `npm run dev` for the Vite dev server)' });
  } catch (e) {
    if (!res.headersSent) json(res, 500, { error: 'internal error' });
    else res.end();
    console.error(e);
  }
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the other assistant server, or set PORT in .env (and match it in vite.config.ts).`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  const mode = MOCK ? 'mock replies' : client ? `model ${MODEL}${WEB_SEARCH ? ' + web search' : ''}` : 'NOT CONFIGURED (set ANTHROPIC_API_KEY or ASSISTANT_MOCK=1)';
  console.log(`assistant server on http://localhost:${PORT}  [${mode}]${existsSync(join(DIST, 'index.html')) ? '  serving dist/' : ''}`);
});
