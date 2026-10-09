import type { MarketSignal } from '../engine/types';
import type { Indicator } from './types';

/**
 * Research -> signals. Turns validated indicators into the engine's MarketSignal shape.
 *
 * Deliberately conservative:
 *  - only figures with status "verified" (matched a second source) can trigger anything;
 *  - every rule is defensive (trim equity, hold more cash, lean to TIPS). Nothing here argues
 *    for MORE risk, so the engine's half-strength damping for risk-on never comes into play;
 *  - signals expire shortly after their data goes stale;
 *  - the engine still bounds each dimension (SIGNAL_LIMITS) and never breaches the stock ceiling.
 *
 * Thresholds are rules of thumb, shown to the user next to the number that tripped them.
 */

export interface RuleEvaluation {
  id: string;
  label: string;
  /** The rule in words, with its threshold. */
  rule: string;
  /** Could the rule be evaluated? False when its input was not verified. */
  usable: boolean;
  triggered: boolean;
  /** What the data says right now, or why the rule could not run. */
  detail: string;
  signal?: MarketSignal;
}

/** Monthly figures arrive ~5 weeks after their reference month; keep the signal for as long as the data counts as fresh (see maxAgeDays in sources.ts). */
const MONTHLY_LIFE_DAYS = 75;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round2 = (x: number) => Math.round(x * 100) / 100;

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7));

export function deriveSignals(indicators: Indicator[]): { signals: MarketSignal[]; evaluations: RuleEvaluation[] } {
  const by = new Map(indicators.map((i) => [i.id, i]));
  const evaluations: RuleEvaluation[] = [];

  const evaluate = (
    id: string,
    label: string,
    rule: string,
    inputId: string,
    run: (ind: Indicator & { value: number; asOf: string }) => { triggered: boolean; detail: string; signal?: Omit<MarketSignal, 'id' | 'source' | 'asOf'>; expiresInDays?: number } | { unusable: string },
  ) => {
    const ind = by.get(inputId);
    if (!ind || ind.status !== 'verified' || ind.value === null || ind.asOf === null) {
      const why = !ind ? 'not available' : ind.status === 'rejected' ? 'withheld after failing validation' : `status is "${ind.status}", and only verified figures are used`;
      evaluations.push({ id, label, rule, usable: false, triggered: false, detail: `${ind?.label ?? inputId} ${why}; rule not evaluated.` });
      return;
    }
    const r = run(ind as Indicator & { value: number; asOf: string });
    if ('unusable' in r) {
      evaluations.push({ id, label, rule, usable: false, triggered: false, detail: r.unusable });
      return;
    }
    const signal: MarketSignal | undefined = r.signal && {
      ...r.signal,
      id,
      source: `research:${ind.primary.name.split(',')[0].toLowerCase().replace(/[^a-z]+/g, '-')}`,
      asOf: ind.asOf,
      strength: round2(r.signal.strength),
      expiresAt: addDays(ind.asOf, r.expiresInDays ?? 7),
    };
    evaluations.push({ id, label, rule, usable: true, triggered: r.triggered, detail: r.detail, signal: r.triggered ? signal : undefined });
  };

  evaluate('research-curve-inverted', 'Inverted yield curve', 'Trim stocks when the 10-year yield is below the 2-year yield.', 'curve-2s10s', (i) => {
    const triggered = i.value < 0;
    return {
      triggered,
      detail: `10-year minus 2-year is ${i.value.toFixed(2)} pt (${i.asOf}).`,
      expiresInDays: 7,
      signal: { dimension: 'equity', direction: -1, strength: clamp(0.3 + 0.5 * Math.abs(i.value), 0.3, 0.8), confidence: 0.5, rationale: `The yield curve is inverted (${i.value.toFixed(2)} pt), which has often come before slowdowns, though with a long and uncertain lead.` },
    };
  });

  evaluate('research-volatility', 'Market stress', 'Hold extra cash when the VIX is at or above 25.', 'vix', (i) => ({
    triggered: i.value >= 25,
    detail: `VIX is ${i.value.toFixed(2)} (${i.asOf}).`,
    expiresInDays: 5,
    signal: { dimension: 'cash', direction: 1, strength: clamp((i.value - 20) / 30, 0.2, 1), confidence: 0.6, rationale: `The VIX is ${i.value.toFixed(1)}, a sign of elevated stress; keep extra cash on hand for rebalancing.` },
  }));

  evaluate('research-inflation', 'Elevated inflation', 'Lean toward inflation-protected bonds when 12-month CPI is at or above 3%.', 'cpi-yoy', (i) => ({
    triggered: i.value >= 3,
    detail: `CPI inflation is ${i.value.toFixed(2)}% for ${i.asOf.slice(0, 7)}.`,
    expiresInDays: MONTHLY_LIFE_DAYS,
    signal: { dimension: 'inflation', direction: 1, strength: clamp((i.value - 2.5) / 4, 0.2, 1), confidence: 0.6, rationale: `Inflation is running at ${i.value.toFixed(1)}%, above the 2% goal; shift some core bonds toward TIPS.` },
  }));

  evaluate('research-labor-weakening', 'Weakening job market', 'Trim stocks when the 3-month average unemployment rate is 0.5 pt or more above its lowest 3-month average of the prior year (the Sahm rule).', 'unemployment', (i) => {
    // The BLS skipped a month in 2025, so tolerate one missing month inside any 3-reading average,
    // but refuse to run on anything patchier than that.
    const last = monthIndex(i.history[i.history.length - 1]?.date ?? '0000-00');
    const h = i.history.filter((o) => last - monthIndex(o.date) <= 14);
    const avgs: number[] = [];
    for (let k = 2; k < h.length; k++) {
      if (monthIndex(h[k].date) - monthIndex(h[k - 2].date) <= 3) avgs.push((h[k].value + h[k - 1].value + h[k - 2].value) / 3);
    }
    if (h.length < 12 || monthIndex(h[h.length - 1].date) - monthIndex(h[h.length - 3].date) > 3 || avgs.length < 9) {
      return { unusable: 'Needs about 15 months of unemployment readings with at most one missing month in a row; the history is too short or too patchy.' };
    }
    const now = avgs[avgs.length - 1];
    const low = Math.min(...avgs.slice(0, -1));
    const gap = now - low;
    return {
      triggered: gap >= 0.5,
      detail: `3-month average is ${now.toFixed(2)}%, ${gap.toFixed(2)} pt above its 12-month low of ${low.toFixed(2)}% (${i.asOf.slice(0, 7)}).`,
      expiresInDays: MONTHLY_LIFE_DAYS,
      signal: { dimension: 'equity', direction: -1, strength: clamp(0.6 + (gap - 0.5), 0.6, 1), confidence: 0.6, rationale: `Unemployment has risen ${gap.toFixed(1)} pt above its recent low, a pattern that has marked past recessions.` },
    };
  });

  return { signals: evaluations.flatMap((e) => (e.signal ? [e.signal] : [])), evaluations };
}
