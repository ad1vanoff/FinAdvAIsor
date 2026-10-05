import { describe, expect, it } from 'vitest';
import { compareProfiles } from '../compare';
import { projectGrowth } from '../projection';
import { moneyCompact } from '../util';

describe('projectGrowth', () => {
  it('starts at the initial amount and keeps percentiles ordered', () => {
    const pts = projectGrowth(100_000, 0.05, 0.08, 20);
    expect(pts).toHaveLength(21);
    expect(pts[0]).toEqual({ year: 0, p10: 100_000, p50: 100_000, p90: 100_000 });
    for (const p of pts) {
      expect(p.p10).toBeLessThanOrEqual(p.p50);
      expect(p.p50).toBeLessThanOrEqual(p.p90);
    }
  });

  it('widens the band over time and grows the median', () => {
    const pts = projectGrowth(100_000, 0.05, 0.08, 20);
    expect(pts[20].p90 - pts[20].p10).toBeGreaterThan(pts[5].p90 - pts[5].p10);
    expect(pts[20].p50).toBeGreaterThan(pts[10].p50);
  });

  it('collapses to a single path with zero volatility', () => {
    const pts = projectGrowth(1000, 0.04, 0, 3);
    expect(pts[3].p10).toBeCloseTo(pts[3].p90, 6);
    expect(pts[3].p50).toBeCloseTo(1000 * 1.04 ** 3, 6);
  });

  it('rejects bad inputs', () => {
    expect(() => projectGrowth(-1, 0.05, 0.1, 5)).toThrow();
    expect(() => projectGrowth(1, Number.NaN, 0.1, 5)).toThrow();
  });
});

describe('compareProfiles', () => {
  it('orders risk and return by profile for a long horizon', () => {
    const rows = compareProfiles({ amount: 100_000, horizonYears: 20, asOf: '2026-09-28' });
    expect(rows.map((r) => r.riskTolerance)).toEqual(['very_conservative', 'conservative', 'moderate', 'growth']);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].volatility).toBeGreaterThan(rows[i - 1].volatility);
      expect(rows[i].expectedReturn).toBeGreaterThan(rows[i - 1].expectedReturn);
    }
  });
});

describe('moneyCompact', () => {
  it('formats magnitudes', () => {
    expect(moneyCompact(950)).toBe('$950');
    expect(moneyCompact(4_560)).toBe('$4.6K');
    expect(moneyCompact(45_600)).toBe('$46K');
    expect(moneyCompact(1_234_567)).toBe('$1.23M');
    expect(moneyCompact(-2_000)).toBe('-$2.0K');
  });
});
