import type { IgnoredSignal, MarketSignal, SignalDimension } from './types';

/**
 * Signal handling: the seam where a future news-ingestion layer plugs in.
 *
 * A provider produces MarketSignals; the engine nets them per dimension into a
 * tilt in [-1, 1] and converts that into a bounded shift (see profiles.ts
 * SIGNAL_LIMITS). Nothing in here can move the plan past its guardrails.
 */

export type NetTilts = Record<SignalDimension, number>;

export const SIGNAL_DIMENSIONS: SignalDimension[] = ['equity', 'duration', 'inflation', 'international', 'cash'];

export interface SignalProvider {
  name: string;
  fetch(): Promise<MarketSignal[]>;
}

/** Provider backed by a fixed list. Useful for tests, demos and manual overrides. */
export class StaticSignalProvider implements SignalProvider {
  constructor(
    public readonly name: string,
    private readonly signals: MarketSignal[],
  ) {}

  async fetch(): Promise<MarketSignal[]> {
    return [...this.signals];
  }
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function validate(signal: MarketSignal, now: Date): string | null {
  if (!SIGNAL_DIMENSIONS.includes(signal.dimension)) return `unknown dimension "${signal.dimension}"`;
  if (signal.direction !== 1 && signal.direction !== -1) return 'direction must be 1 or -1';
  if (!(signal.strength >= 0 && signal.strength <= 1)) return 'strength must be within 0..1';
  if (!(signal.confidence >= 0 && signal.confidence <= 1)) return 'confidence must be within 0..1';
  if (signal.expiresAt) {
    const exp = new Date(signal.expiresAt);
    if (Number.isNaN(exp.getTime())) return 'expiresAt is not a valid date';
    if (exp.getTime() < now.getTime()) return `expired on ${signal.expiresAt}`;
  }
  return null;
}

/**
 * Net a list of signals into one tilt per dimension.
 * Each signal contributes direction × strength × confidence; the sum is clamped to [-1, 1].
 */
export function netTilts(
  signals: MarketSignal[],
  now: Date = new Date(),
): { tilts: NetTilts; applied: MarketSignal[]; ignored: IgnoredSignal[] } {
  const tilts: NetTilts = { equity: 0, duration: 0, inflation: 0, international: 0, cash: 0 };
  const applied: MarketSignal[] = [];
  const ignored: IgnoredSignal[] = [];

  for (const s of signals) {
    const problem = validate(s, now);
    if (problem) {
      ignored.push({ id: s.id, reason: problem });
      continue;
    }
    tilts[s.dimension] += s.direction * s.strength * s.confidence;
    applied.push(s);
  }
  for (const d of SIGNAL_DIMENSIONS) tilts[d] = clamp(tilts[d], -1, 1);
  return { tilts, applied, ignored };
}

/**
 * Illustrative signals used by the CLI and UI to show how the news layer will
 * influence a plan. A real provider would generate these from headlines.
 */
export const DEMO_SIGNALS: Record<string, MarketSignal> = {
  'recession-risk': {
    id: 'recession-risk',
    source: 'demo',
    asOf: '2026-09-01',
    dimension: 'equity',
    direction: -1,
    strength: 0.6,
    confidence: 0.6,
    rationale: 'Leading indicators point to slowing growth; trim equity toward the low end of the range.',
  },
  'strong-earnings': {
    id: 'strong-earnings',
    source: 'demo',
    asOf: '2026-09-01',
    dimension: 'equity',
    direction: 1,
    strength: 0.5,
    confidence: 0.5,
    rationale: 'Broad earnings beats and easing financial conditions; modestly favour equity.',
  },
  'rates-falling': {
    id: 'rates-falling',
    source: 'demo',
    asOf: '2026-09-01',
    dimension: 'duration',
    direction: 1,
    strength: 0.5,
    confidence: 0.5,
    rationale: 'Central bank guidance points to cuts; lengthen bond duration to lock in yields.',
  },
  'inflation-sticky': {
    id: 'inflation-sticky',
    source: 'demo',
    asOf: '2026-09-01',
    dimension: 'inflation',
    direction: 1,
    strength: 0.5,
    confidence: 0.6,
    rationale: 'Core inflation remains above target; shift core bonds toward TIPS.',
  },
  'dollar-weakening': {
    id: 'dollar-weakening',
    source: 'demo',
    asOf: '2026-09-01',
    dimension: 'international',
    direction: 1,
    strength: 0.4,
    confidence: 0.5,
    rationale: 'A softer dollar favours unhedged international equity.',
  },
  'volatility-spike': {
    id: 'volatility-spike',
    source: 'demo',
    asOf: '2026-09-01',
    dimension: 'cash',
    direction: 1,
    strength: 0.5,
    confidence: 0.7,
    rationale: 'Market stress elevated; hold extra dry powder for rebalancing.',
  },
};
