import { describe, expect, it } from 'vitest';
import { allocate } from '../../engine';
import { deriveSignals } from '../signals';
import type { Indicator, Observation, ResearchStatus } from '../types';

const ind = (id: string, value: number, asOf: string, over: Partial<Indicator> = {}): Indicator => ({
  id,
  group: 'rates',
  label: id,
  unit: 'percent',
  why: '',
  status: 'verified',
  value,
  asOf,
  change: 0,
  history: [],
  checks: [],
  primary: { name: 'FRED (St. Louis Fed), X', url: 'https://example.com' },
  ...over,
});

const months = (vals: number[], endYear = 2026, endMonth = 9): Observation[] =>
  vals.map((value, i) => {
    const idx = endYear * 12 + (endMonth - 1) - (vals.length - 1 - i);
    return { date: `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}-01`, value };
  });

const labor = (history: Observation[]) => deriveSignals([ind('unemployment', 5, '2026-09-01', { history })]).evaluations.find((e) => e.id === 'research-labor-weakening')!;

const calm = () => [ind('curve-2s10s', 0.46, '2026-10-01'), ind('vix', 15.3, '2026-10-02'), ind('cpi-yoy', 2.4, '2026-08-01'), ind('unemployment', 4.2, '2026-09-01', { history: months(Array(15).fill(4.1)) })];

describe('deriveSignals', () => {
  it('produces nothing in calm conditions, but still reports every rule', () => {
    const { signals, evaluations } = deriveSignals(calm());
    expect(signals).toEqual([]);
    expect(evaluations).toHaveLength(4);
    expect(evaluations.every((e) => e.usable && !e.triggered)).toBe(true);
  });

  it('fires defensive signals with sensible dimensions and directions', () => {
    const { signals } = deriveSignals([
      ind('curve-2s10s', -0.4, '2026-10-01'),
      ind('vix', 32, '2026-10-02'),
      ind('cpi-yoy', 3.9, '2026-08-01'),
      ind('unemployment', 5.0, '2026-09-01', { history: months([4.0, 4.0, 4.0, 4.0, 4.0, 4.0, 4.0, 4.0, 4.0, 4.0, 4.0, 4.0, 4.5, 4.8, 5.0]) }),
    ]);
    const get = (id: string) => signals.find((s) => s.id === id);
    expect(get('research-curve-inverted')).toMatchObject({ dimension: 'equity', direction: -1 });
    expect(get('research-volatility')).toMatchObject({ dimension: 'cash', direction: 1 });
    expect(get('research-inflation')).toMatchObject({ dimension: 'inflation', direction: 1 });
    expect(get('research-labor-weakening')).toMatchObject({ dimension: 'equity', direction: -1 });
    // No rule ever argues for more risk.
    expect(signals.every((s) => !(s.dimension === 'equity' && s.direction === 1))).toBe(true);
    for (const s of signals) {
      expect(s.strength).toBeGreaterThan(0);
      expect(s.strength).toBeLessThanOrEqual(1);
      expect(s.expiresAt! > s.asOf).toBe(true);
    }
  });

  it.each<ResearchStatus>(['single-source', 'stale', 'rejected'])('ignores inputs that are %s', (status) => {
    const { signals, evaluations } = deriveSignals([ind('vix', 40, '2026-10-02', { status, value: status === 'rejected' ? null : 40, asOf: status === 'rejected' ? null : '2026-10-02' })]);
    expect(signals).toEqual([]);
    expect(evaluations.find((e) => e.id === 'research-volatility')).toMatchObject({ usable: false, triggered: false });
  });

  it('tolerates one missing month in the unemployment history but not a patchy one', () => {
    const base = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4.5, 4.8, 5.0];
    const oneGap = months(base);
    oneGap.splice(5, 1);
    const e0 = labor(oneGap);
    expect(e0.usable).toBe(true);
    expect(e0.triggered).toBe(true);

    const patchy = months(base).filter((_, k) => k % 2 === 0 || k > 12);
    expect(labor(patchy)).toMatchObject({ usable: false, detail: expect.stringContaining('too patchy') });
    expect(labor(months([4, 5]))).toMatchObject({ usable: false });
  });

  it('keeps a monthly signal alive for as long as its data counts as fresh', () => {
    const { signals } = deriveSignals([ind('cpi-yoy', 3.5, '2026-08-01')]);
    const plan = allocate({ amount: 100_000, riskTolerance: 'moderate', horizonYears: 15, hasEmergencyFund: true, signals, asOf: '2026-10-08' });
    expect(plan.signals.applied.map((s) => s.id)).toEqual(['research-inflation']);
  });

  it('signals flow through the allocator within its bounds and lower stocks only', () => {
    const base = { amount: 100_000, riskTolerance: 'moderate' as const, horizonYears: 15, hasEmergencyFund: true };
    const stress = deriveSignals([ind('curve-2s10s', -1, '2026-10-01'), ind('vix', 45, '2026-10-02')]).signals;
    const plain = allocate({ ...base, asOf: '2026-10-05' });
    const tilted = allocate({ ...base, signals: stress, asOf: '2026-10-05' });
    expect(tilted.signals.applied.length).toBe(2);
    expect(tilted.summary.equityWeight).toBeLessThanOrEqual(plain.summary.equityWeight);
    expect(plain.summary.equityWeight - tilted.summary.equityWeight).toBeLessThanOrEqual(0.05 + 1e-9);
  });

  it('expired research signals are ignored by the allocator', () => {
    const { signals } = deriveSignals([ind('vix', 45, '2026-10-02')]);
    const plan = allocate({ amount: 100_000, riskTolerance: 'moderate', horizonYears: 15, hasEmergencyFund: true, signals, asOf: '2026-11-30' });
    expect(plan.signals.applied).toEqual([]);
    expect(plan.signals.ignored[0].reason).toContain('expired');
  });
});
