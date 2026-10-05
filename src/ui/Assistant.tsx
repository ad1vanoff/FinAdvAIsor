import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { suggestedQuestions } from '../assistant/prompt';
import type { AssistantContext } from '../assistant/prompt';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  sources?: { title: string; url: string }[];
  error?: string;
}

interface Health {
  configured: boolean;
  mock: boolean;
  model: string;
}

type ServerEvent = { type: 'text'; text: string } | { type: 'done'; sources?: { title: string; url: string }[] } | { type: 'error'; message: string };

/** Floating chat panel that answers questions about the plan, grounded in the tool's own data and sources. */
export function Assistant({ context }: { context: AssistantContext }) {
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState<Health | 'error' | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open || health !== null) return;
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((h: Health) => setHealth(h))
      .catch(() => setHealth('error'));
  }, [open, health]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  useEffect(() => {
    if (open && !busy) inputRef.current?.focus();
  }, [open, busy]);

  const patchLast = (fn: (m: Msg) => Msg) =>
    setMessages((ms) => {
      if (ms.length === 0) return ms;
      const copy = ms.slice();
      copy[copy.length - 1] = fn(copy[copy.length - 1]);
      return copy;
    });

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const history: Msg[] = [...messages.filter((m) => !m.error && m.content), { role: 'user', content: q }];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setInput('');
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })), context }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `The assistant server answered ${res.status}.`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const line = chunk.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          const ev = JSON.parse(line.slice(6)) as ServerEvent;
          if (ev.type === 'text') patchLast((m) => ({ ...m, content: m.content + ev.text }));
          else if (ev.type === 'done') patchLast((m) => ({ ...m, sources: ev.sources && ev.sources.length > 0 ? ev.sources : undefined }));
          else if (ev.type === 'error') patchLast((m) => ({ ...m, error: ev.message }));
        }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') patchLast((m) => ({ ...m, content: m.content || '(stopped)' }));
      else patchLast((m) => ({ ...m, error: (e as Error).message }));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const status = health === null ? '' : health === 'error' ? 'server offline' : health.mock ? 'mock mode' : health.configured ? health.model : 'not configured';

  return (
    <>
      <button type="button" className={`assistant-fab${open ? ' open' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="assistant-panel">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 5h16v10H8l-4 4V5z" />
          <path d="M8 9h8M8 12h5" />
        </svg>
        {open ? 'Close assistant' : 'Ask about your plan'}
      </button>

      {open && (
        <section className="assistant-panel fade-up" id="assistant-panel" role="dialog" aria-label="Plan assistant">
          <header className="assistant-head">
            <div>
              <strong>Plan assistant</strong>
              <span className="hint">{status}</span>
            </div>
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Close
            </button>
          </header>

          {health === 'error' && (
            <div className="warning small">
              The assistant server is not running. Start it with <code>npm run server</code>, or run both servers with <code>npm run dev:full</code>.
            </div>
          )}
          {health !== null && health !== 'error' && !health.configured && (
            <div className="warning small">
              The server is up but has no API key. Copy <code>.env.example</code> to <code>.env</code>, set <code>ANTHROPIC_API_KEY</code>, and restart. For UI testing set <code>ASSISTANT_MOCK=1</code>.
            </div>
          )}

          <div className="assistant-messages" ref={listRef}>
            {messages.length === 0 && (
              <div className="assistant-intro">
                <p>I can explain your plan, the rules behind it, and the reading they come from. Educational only, not personalised advice.</p>
                <div className="chips">
                  {suggestedQuestions(context).map((q) => (
                    <button type="button" className="chip" key={q} onClick={() => send(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div className={`msg ${m.role}`} key={i}>
                {m.role === 'assistant' && !m.content && busy && i === messages.length - 1 ? (
                  <span className="typing" aria-label="Thinking">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : (
                  <Rich text={m.content} />
                )}
                {m.sources && (
                  <div className="src">
                    Web sources:{' '}
                    {m.sources.map((s, j) => (
                      <span key={s.url}>
                        {j > 0 && ' · '}
                        <a href={s.url} target="_blank" rel="noopener noreferrer">
                          {s.title}
                        </a>
                      </span>
                    ))}
                  </div>
                )}
                {m.error && <div className="msg-error">{m.error}</div>}
              </div>
            ))}
          </div>

          <form
            className="assistant-input"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              placeholder="Ask about your allocation…"
              rows={2}
              disabled={busy}
              aria-label="Your question"
            />
            {busy ? (
              <button type="button" className="btn" onClick={() => abortRef.current?.abort()}>
                Stop
              </button>
            ) : (
              <button type="submit" className="btn primary" disabled={!input.trim()}>
                Send
              </button>
            )}
          </form>
          <p className="hint assistant-foot">Answers draw on your plan and the tool's sources. Not personalised advice.</p>
        </section>
      )}
    </>
  );
}

/** Tiny renderer for the assistant's plain-ish text: paragraphs, "- " lists, **bold**, bare URLs. */
function Rich({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).filter((b) => b.trim());
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        const isList = lines.every((l) => /^\s*[-*]\s+/.test(l));
        const isNumbered = lines.every((l) => /^\s*\d+[.)]\s+/.test(l));
        if (isList || isNumbered) {
          const Tag = isNumbered ? 'ol' : 'ul';
          return (
            <Tag key={i}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*(?:[-*]|\d+[.)])\s+/, ''))}</li>
              ))}
            </Tag>
          );
        }
        return <p key={i}>{inline(block)}</p>;
      })}
    </>
  );
}

function inline(s: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|https?:\/\/[^\s)]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) out.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    else
      out.push(
        <a key={k++} href={tok} target="_blank" rel="noopener noreferrer">
          {tok.replace(/^https?:\/\//, '')}
        </a>,
      );
    last = m.index + tok.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
