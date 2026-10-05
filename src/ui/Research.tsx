import { useCallback, useEffect, useState } from 'react';
import type { Indicator, ResearchGroup, ResearchSnapshot, ResearchStatus } from '../research/types';

/** Survives tab switches so the sources are not re-queried every time the tab is opened. */
let cached: ResearchSnapshot | null = null;

const GROUPS: { id: ResearchGroup; title: string; blurb: string }[] = [
  { id: 'rates', title: 'Interest rates', blurb: 'What safe money and bonds pay today.' },
  { id: 'inflation', title: 'Economy', blurb: 'Prices and jobs, the backdrop for risk assets.' },
  { id: 'markets', title: 'Markets', blurb: 'Stock-market level and stress gauges, for context only.' },
];

const STATUS: Record<ResearchStatus, { label: string; icon: string; help: string }> = {
  verified: { label: 'Verified', icon: '✓', help: 'Passed every check and matched a second, independent source for the same date.' },
  'single-source': { label: 'Single source', icon: '◐', help: 'Passed every check, but no independent source exists to compare against.' },
  stale: { label: 'Stale', icon: '⏱', help: 'Passed the checks but is older than expected for how often this is published.' },
  rejected: { label: 'Withheld', icon: '✕', help: 'Failed a check, so no number is shown rather than a doubtful one.' },
};

function formatValue(i: Indicator): string {
  if (i.value === null) return 'Unavailable';
  return i.unit === 'percent' ? `${i.value.toFixed(2)}%` : i.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatChange(i: Indicator): string | null {
  if (i.change === null || i.value === null) return null;
  const sign = i.change > 0 ? '+' : i.change < 0 ? '−' : '';
  if (i.unit === 'percent') return Math.abs(i.change) < 0.005 ? 'unchanged' : `${sign}${Math.abs(i.change).toFixed(2)} pt`;
  const prior = i.value - i.change;
  return prior ? `${sign}${Math.abs((i.change / prior) * 100).toFixed(2)}%` : null;
}

function formatDate(iso: string, monthly: boolean): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, monthly ? { month: 'long', year: 'numeric', timeZone: 'UTC' } : { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function Spark({ data }: { data: Indicator['history'] }) {
  if (data.length < 2) return null;
  const w = 120;
  const h = 32;
  const vals = data.map((d) => d.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const pts = data.map((d, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${(h - 3 - ((d.value - lo) / span) * (h - 6)).toFixed(1)}`).join(' ');
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Card({ i }: { i: Indicator }) {
  const st = STATUS[i.status];
  const change = formatChange(i);
  const monthly = i.id === 'cpi-yoy' || i.id === 'unemployment';
  return (
    <div className={`panel research-card ${i.status}`}>
      <div className="rc-head">
        <h3>{i.label}</h3>
        <span className={`status ${i.status}`} title={st.help}>
          <span aria-hidden="true">{st.icon}</span> {st.label}
        </span>
      </div>
      <div className="rc-value">
        <span className="big">{formatValue(i)}</span>
        {change && <span className="small muted">{change} vs prior</span>}
      </div>
      {i.status !== 'rejected' ? (
        <div className="rc-meta">
          <span className="small muted">As of {i.asOf && formatDate(i.asOf, monthly)}</span>
          <Spark data={i.history} />
        </div>
      ) : (
        <p className="small muted">A reading was fetched but failed validation, so it is not shown. Details below.</p>
      )}
      <p className="small secondary">{i.why}</p>
      <details className="rc-checks">
        <summary className="small">How this was checked</summary>
        <ul>
          {i.checks.map((c, n) => (
            <li key={n} className={c.passed ? 'ok' : 'bad'}>
              <span aria-hidden="true">{c.passed ? '✓' : '✕'}</span> <strong>{c.name}</strong>: {c.detail}
            </li>
          ))}
        </ul>
        {i.method && <p className="small muted">Method: {i.method}.</p>}
        <p className="small">
          Source:{' '}
          <a href={i.primary.url} target="_blank" rel="noreferrer">
            {i.primary.name}
          </a>
          {i.crossCheck && (
            <>
              {' · '}Compared with:{' '}
              <a href={i.crossCheck.url} target="_blank" rel="noreferrer">
                {i.crossCheck.name}
              </a>
            </>
          )}
        </p>
      </details>
    </div>
  );
}

export function Research() {
  const [snap, setSnap] = useState<ResearchSnapshot | null>(cached);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!cached);

  const load = useCallback(async (refresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/research${refresh ? '?refresh=1' : ''}`);
      if (!res.ok) throw new Error(res.status === 429 ? 'Too many requests. Try again in a minute.' : `The research service returned ${res.status}.`);
      const data = (await res.json()) as ResearchSnapshot;
      cached = data;
      setSnap(data);
    } catch (e) {
      const msg = e instanceof TypeError ? 'Could not reach the research service. Start it with `npm run server` (or `npm run dev:full`).' : (e as Error).message;
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!cached) void load(false);
  }, [load]);

  const counts = snap ? (['verified', 'single-source', 'stale', 'rejected'] as ResearchStatus[]).map((s) => [s, snap.indicators.filter((i) => i.status === s).length] as const) : [];

  return (
    <div className="stack">
      <div className="panel">
        <div className="research-top">
          <div>
            <h2>Market research</h2>
            <p className="small secondary" style={{ marginTop: 4 }}>
              Figures come straight from public primary sources (U.S. Treasury, Federal Reserve, Bureau of Labor Statistics, Cboe) and are checked before they are shown: parsed, range-tested, checked for age and sudden jumps, and compared with a second source for the same date wherever one exists. Anything that fails is withheld, never guessed. This page is context only and does not change your plan.
            </p>
          </div>
          <button type="button" className="btn" onClick={() => void load(true)} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
        {snap && (
          <p className="small muted" style={{ marginTop: 8 }}>
            Fetched {new Date(snap.fetchedAt).toLocaleTimeString()} · {counts.filter(([, n]) => n > 0).map(([s, n]) => `${n} ${STATUS[s].label.toLowerCase()}`).join(', ')}
          </p>
        )}
        <div className="legend small" style={{ marginTop: 8 }}>
          {(Object.keys(STATUS) as ResearchStatus[]).map((s) => (
            <span key={s} className={`status ${s}`} title={STATUS[s].help}>
              <span aria-hidden="true">{STATUS[s].icon}</span> {STATUS[s].label}: <span className="muted">{STATUS[s].help}</span>
            </span>
          ))}
        </div>
      </div>

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {loading && !snap && <div className="panel muted">Fetching and validating the latest figures…</div>}

      {snap && snap.sourceErrors.length > 0 && (
        <div className="panel warn small" role="status">
          Some sources could not be reached ({snap.sourceErrors.map((e) => `${e.source}: ${e.message}`).join('; ')}). Affected figures are downgraded or withheld, not estimated.
        </div>
      )}

      {snap &&
        GROUPS.map((g) => (
          <section key={g.id} className="stack" aria-labelledby={`rg-${g.id}`}>
            <div>
              <h2 id={`rg-${g.id}`}>{g.title}</h2>
              <p className="small muted">{g.blurb}</p>
            </div>
            <div className="research-grid">
              {snap.indicators
                .filter((i) => i.group === g.id)
                .map((i) => (
                  <Card key={i.id} i={i} />
                ))}
            </div>
          </section>
        ))}

      <p className="small muted">Educational context, not a recommendation. Day-to-day moves are rarely a reason to change a long-term plan.</p>
    </div>
  );
}
