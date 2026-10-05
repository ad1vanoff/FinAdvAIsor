import { describe, expect, it } from 'vitest';
import { allocate } from '../allocate';
import { DEMO_SIGNALS, netTilts } from '../signals';
import { MAX_EQUITY, MIN_POSITION_WEIGHT, RISK_PROFILES } from '../profiles';
import type { AllocationInput, MarketSignal, RiskTolerance } from '../types';

const RISKS: RiskTolerance[] = ['very_conservative', 'conservative', 'moderate', 'growth'];
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;

function plan(overrides: Partial<AllocationInput> = {}) {
  return allocate({ amount: 100_000, asOf: '2026-09-23', ...overrides });
}

describe('accounting invariants', () => {
  const grid: Partial<AllocationInput>[] = [];
  for (const riskTolerance of RISKS) {
    for (const horizonYears of [1, 3, 5, 10, 25]) {
      for (const flags of [
        {},
        { needsIncome: true, includeRealEstate: true, includeGold: true },
        { includeInternational: false, inflationProtection: false },
        { hasEmergencyFund: false, monthlyExpenses: 4_000, nearTermNeed: 10_000, age: 62 },
        { signals: Object.values(DEMO_SIGNALS) },
      ]) {
        grid.push({ riskTolerance, horizonYears, ...flags });
      }
    }
  }

  it.each(grid.map((g, i) => [i, g] as const))('case %i sums, caps and rounding hold', (_i, g) => {
    for (const amount of [1_000, 12_345.67, 100_000, 2_500_000]) {
      const p = allocate({ amount, asOf: '2026-09-23', ...g });

      // Dollars reconcile to the cent.
      expect(near(sum(p.lines.map((l) => l.dollars)), amount, 0.005)).toBe(true);
      expect(near(sum(p.buckets.map((b) => b.dollars)), amount, 0.01)).toBe(true);
      expect(near(sum(p.lines.map((l) => l.weightOfTotal)), 1, 1e-6)).toBe(true);

      // Invested weights are whole percents that sum to exactly 100%.
      const invested = p.lines.filter((l) => l.weightOfInvested !== null);
      if (p.summary.investableDollars > 0) {
        expect(near(sum(invested.map((l) => l.weightOfInvested!)), 1, 1e-9)).toBe(true);
        for (const l of invested) {
          expect(near(l.weightOfInvested! * 100, Math.round(l.weightOfInvested! * 100), 1e-9)).toBe(true);
          if (l.assetClass !== 'cash_hysa') expect(l.weightOfInvested!).toBeGreaterThanOrEqual(MIN_POSITION_WEIGHT - 1e-9);
        }
      }

      // Guardrails.
      expect(p.summary.equityWeight).toBeLessThanOrEqual(p.summary.equityCap + 0.011); // +1% rounding slack
      expect(p.summary.equityWeight).toBeLessThanOrEqual(MAX_EQUITY + 0.011);
      expect(p.summary.alternativesWeight).toBeLessThanOrEqual(0.13);
      for (const l of p.lines) expect(l.dollars).toBeGreaterThan(0);
    }
  });
});

describe('conservative defaults', () => {
  it('defaults to the conservative profile with a bond majority', () => {
    const p = plan();
    expect(p.input.riskTolerance).toBe('conservative');
    expect(p.summary.equityWeight).toBeLessThanOrEqual(0.35);
    expect(p.summary.fixedIncomeWeight).toBeGreaterThan(p.summary.equityWeight);
  });

  it('never exceeds the tool-wide ceiling even for growth with a long horizon', () => {
    const p = plan({ riskTolerance: 'growth', horizonYears: 30, age: 25 });
    expect(p.summary.equityWeight).toBeLessThanOrEqual(MAX_EQUITY + 1e-9);
  });

  it('equity rises monotonically with risk tolerance', () => {
    const eq = RISKS.map((r) => plan({ riskTolerance: r, horizonYears: 15 }).summary.equityWeight);
    for (let i = 1; i < eq.length; i++) expect(eq[i]).toBeGreaterThan(eq[i - 1]);
  });
});

describe('horizon and age caps', () => {
  it('caps equity at 10% for money needed within two years', () => {
    const p = plan({ riskTolerance: 'growth', horizonYears: 1 });
    expect(p.summary.equityWeight).toBeLessThanOrEqual(0.1 + 1e-9);
    expect(p.summary.equityCapReason).toMatch(/horizon/);
  });

  it('applies the 100-minus-age rule', () => {
    const p = plan({ riskTolerance: 'growth', horizonYears: 20, age: 80 });
    expect(p.summary.equityWeight).toBeLessThanOrEqual(0.2 + 1e-9);
    expect(p.summary.equityCapReason).toMatch(/age/);
  });

  it('adds a small bonus for 20+ year horizons but still respects the ceiling', () => {
    const short = plan({ riskTolerance: 'conservative', horizonYears: 15 });
    const long = plan({ riskTolerance: 'conservative', horizonYears: 25 });
    expect(long.summary.equityWeight).toBeGreaterThan(short.summary.equityWeight);
    expect(long.summary.equityWeight).toBeLessThanOrEqual(MAX_EQUITY);
  });
});

describe('reserves come first', () => {
  it('carves out six months of expenses when there is no emergency fund', () => {
    const p = plan({ hasEmergencyFund: false, monthlyExpenses: 4_000 });
    const ef = p.lines.find((l) => l.role === 'emergency_fund');
    expect(ef?.dollars).toBe(24_000);
    expect(p.summary.investableDollars).toBe(76_000);
  });

  it('parks near-term needs in T-bills', () => {
    const p = plan({ nearTermNeed: 15_000 });
    const nt = p.lines.find((l) => l.role === 'near_term');
    expect(nt?.assetClass).toBe('tbills');
    expect(nt?.dollars).toBe(15_000);
  });

  it('directs everything to reserves when the amount is too small to cover them', () => {
    const p = plan({ amount: 10_000, hasEmergencyFund: false, monthlyExpenses: 4_000 });
    expect(p.summary.investableDollars).toBe(0);
    expect(p.lines).toHaveLength(1);
    expect(p.warnings.join(' ')).toMatch(/Nothing is left to invest/);
  });

  it('warns when expenses are missing and no emergency fund exists', () => {
    const p = plan({ hasEmergencyFund: false });
    expect(p.warnings.join(' ')).toMatch(/monthly expenses were not provided/);
    expect(p.summary.reservesDollars).toBe(0);
  });
});

describe('toggles', () => {
  it('drops international lines when switched off', () => {
    const p = plan({ includeInternational: false });
    expect(p.lines.some((l) => l.assetClass === 'intl_developed' || l.assetClass === 'emerging')).toBe(false);
  });

  it('adds TIPS by default and removes them when inflation protection is off', () => {
    expect(plan().lines.some((l) => l.assetClass === 'tips')).toBe(true);
    expect(plan({ inflationProtection: false }).lines.some((l) => l.assetClass === 'tips')).toBe(false);
  });

  it('caps gold at 5% and REITs at a tenth of equity', () => {
    const p = plan({ riskTolerance: 'moderate', includeGold: true, includeRealEstate: true });
    const gold = p.lines.find((l) => l.assetClass === 'gold')!;
    const reit = p.lines.find((l) => l.assetClass === 'reit')!;
    expect(gold.weightOfInvested).toBeLessThanOrEqual(0.05 + 1e-9);
    expect(reit.weightOfInvested).toBeLessThanOrEqual(p.summary.equityWeight * 0.1 / 0.9 + 0.011);
  });

  it('income need lowers equity and adds dividend and corporate lines', () => {
    const base = plan({ riskTolerance: 'moderate' });
    const inc = plan({ riskTolerance: 'moderate', needsIncome: true });
    expect(inc.summary.equityWeight).toBeLessThan(base.summary.equityWeight);
    expect(inc.lines.some((l) => l.assetClass === 'us_dividend')).toBe(true);
    expect(inc.lines.some((l) => l.assetClass === 'ig_corporate')).toBe(true);
  });

  it('omits emerging markets for the very conservative profile', () => {
    const p = plan({ riskTolerance: 'very_conservative', horizonYears: 15 });
    expect(p.lines.some((l) => l.assetClass === 'emerging')).toBe(false);
  });

  it('swaps in ESG examples when requested', () => {
    const p = plan({ esg: true });
    const us = p.lines.find((l) => l.assetClass === 'us_large')!;
    expect(us.examples[0].ticker).toBe('ESGV');
  });
});

describe('signals (the news hook)', () => {
  const sig = (over: Partial<MarketSignal>): MarketSignal => ({
    id: 'x',
    source: 'test',
    asOf: '2026-09-01',
    dimension: 'equity',
    direction: -1,
    strength: 1,
    confidence: 1,
    rationale: 'test',
    ...over,
  });

  it('a full-strength risk-off signal cuts equity by at most 5 points', () => {
    const base = plan({ riskTolerance: 'moderate' });
    const p = plan({ riskTolerance: 'moderate', signals: [sig({})] });
    const diff = base.summary.equityWeight - p.summary.equityWeight;
    expect(diff).toBeGreaterThan(0.03);
    expect(diff).toBeLessThanOrEqual(0.05 + 0.011);
    expect(p.signals.applied[0].effect).toMatch(/equity 50% to 45%/);
  });

  it('a risk-on signal is damped to half strength', () => {
    const base = plan({ riskTolerance: 'moderate' });
    const p = plan({ riskTolerance: 'moderate', signals: [sig({ direction: 1 })] });
    const diff = p.summary.equityWeight - base.summary.equityWeight;
    expect(diff).toBeLessThanOrEqual(0.025 + 0.011);
    expect(diff).toBeGreaterThan(0);
  });

  it('a risk-on signal cannot push equity through its ceiling', () => {
    const p = plan({ riskTolerance: 'growth', horizonYears: 1, signals: [sig({ direction: 1 })] });
    expect(p.summary.equityWeight).toBeLessThanOrEqual(0.1 + 1e-9);
    expect(p.signals.applied[0].effect).toMatch(/ceiling/);
  });

  it('expired and malformed signals are ignored with a reason', () => {
    const p = plan({
      signals: [sig({ id: 'old', expiresAt: '2026-01-01' }), sig({ id: 'bad', strength: 7 })],
    });
    expect(p.signals.applied).toHaveLength(0);
    expect(p.signals.ignored.map((s) => s.id).sort()).toEqual(['bad', 'old']);
  });

  it('ignores international and inflation signals when those sleeves are off', () => {
    const p = plan({
      includeInternational: false,
      inflationProtection: false,
      signals: [sig({ id: 'i', dimension: 'international', direction: 1 }), sig({ id: 'f', dimension: 'inflation', direction: 1 })],
    });
    expect(p.signals.applied).toHaveLength(0);
    expect(p.signals.ignored).toHaveLength(2);
  });

  it('opposing signals net out and are clamped to [-1, 1]', () => {
    const { tilts } = netTilts([sig({}), sig({ id: 'y', direction: 1 })], new Date('2026-09-23'));
    expect(tilts.equity).toBe(0);
    const { tilts: t2 } = netTilts([sig({}), sig({ id: 'y' }), sig({ id: 'z' })], new Date('2026-09-23'));
    expect(t2.equity).toBe(-1);
  });

  it('a cash signal raises the buffer and funds it from equity', () => {
    const base = plan({ riskTolerance: 'moderate' });
    const p = plan({ riskTolerance: 'moderate', signals: [sig({ dimension: 'cash', direction: 1 })] });
    expect(p.summary.cashWeight).toBeGreaterThan(base.summary.cashWeight);
    expect(p.summary.equityWeight).toBeLessThan(base.summary.equityWeight);
  });

  it('duration and inflation signals move money inside the bond sleeve only', () => {
    const base = plan({ riskTolerance: 'conservative' });
    const p = plan({ riskTolerance: 'conservative', signals: [DEMO_SIGNALS['rates-falling'], DEMO_SIGNALS['inflation-sticky']] });
    expect(near(p.summary.fixedIncomeWeight, base.summary.fixedIncomeWeight, 0.011)).toBe(true);
    const w = (id: string, x = p) => x.lines.find((l) => l.assetClass === id)?.weightOfInvested ?? 0;
    expect(w('short_treasury')).toBeLessThan(w('short_treasury', base));
    expect(w('tips')).toBeGreaterThan(w('tips', base));
  });
});

describe('input validation', () => {
  it('rejects non-positive amounts', () => {
    expect(() => allocate({ amount: 0 })).toThrow(/amount/);
    expect(() => allocate({ amount: -5 })).toThrow(/amount/);
    expect(() => allocate({ amount: Number.NaN })).toThrow(/amount/);
  });

  it('rejects bad ages and horizons', () => {
    expect(() => allocate({ amount: 1, age: 150 })).toThrow(/age/);
    expect(() => allocate({ amount: 1, horizonYears: -1 })).toThrow(/horizon/);
  });

  it('exposes the risk profiles it uses', () => {
    expect(Object.keys(RISK_PROFILES)).toEqual(RISKS);
  });
});

describe('risk summary', () => {
  it('is bumpier for growth than for very conservative', () => {
    const vc = plan({ riskTolerance: 'very_conservative', horizonYears: 15 });
    const g = plan({ riskTolerance: 'growth', horizonYears: 15 });
    expect(g.summary.expectedVolatility).toBeGreaterThan(vc.summary.expectedVolatility);
    expect(g.summary.expectedReturn).toBeGreaterThan(vc.summary.expectedReturn);
    expect(g.summary.typicalBadYear).toBeLessThan(vc.summary.typicalBadYear);
  });
});

describe('derivation trace', () => {
  it('walks from the profile start to the final rounded stock share', () => {
    const p = plan({ riskTolerance: 'moderate', horizonYears: 10, includeGold: true, signals: [DEMO_SIGNALS['recession-risk']] });
    const stages = p.derivation.map((d) => d.stage);
    expect(stages[0]).toBe('profile');
    expect(stages).toContain('signals');
    expect(stages).toContain('alternatives');
    expect(stages[stages.length - 1]).toBe('final');
    expect(p.derivation[0].equity).toBeCloseTo(RISK_PROFILES.moderate.baseEquity, 9);
    expect(p.derivation[p.derivation.length - 1].equity).toBeCloseTo(p.summary.equityWeight, 9);
    for (let i = 1; i < p.derivation.length - 1; i++) expect(p.derivation[i].equity).toBeLessThanOrEqual(p.derivation[i - 1].equity + 1e-9);
  });
});
