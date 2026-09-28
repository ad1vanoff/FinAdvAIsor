import { ASSET_CLASSES, BUCKET_LABELS, BUCKET_ORDER, examplesFor } from './catalog';
import {
  BOND_MIX,
  DEFAULT_ACCOUNT_TYPE,
  DEFAULT_HORIZON_YEARS,
  DEFAULT_RISK_TOLERANCE,
  DISCLAIMER,
  EMERGENCY_FUND_MONTHS,
  EQUITY_MIX,
  GOLD_WEIGHT,
  INCOME_EQUITY_SHIFT,
  MAX_EQUITY,
  MIN_POSITION_WEIGHT,
  REBALANCING,
  RISK_ON_SIGNAL_DAMPING,
  RISK_PROFILES,
  SIGNAL_LIMITS,
  SMALL_PORTFOLIO_THRESHOLD,
  ageEquityCap,
  horizonEquityBonus,
  horizonEquityCap,
} from './profiles';
import { portfolioRisk } from './risk';
import { netTilts } from './signals';
import type {
  AllocationInput,
  AllocationLine,
  AllocationPlan,
  AppliedSignal,
  AssetClassId,
  Bucket,
  BucketSummary,
  IgnoredSignal,
  MarketSignal,
  ResolvedInput,
  SignalDimension,
} from './types';
import { clamp, money, pct, pts, round2 } from './util';

// ---------------------------------------------------------------------------
// Input resolution
// ---------------------------------------------------------------------------

export function resolveInput(raw: AllocationInput): ResolvedInput {
  const { amount } = raw;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new Error('amount must be a positive, finite number');
  }
  const horizonYears = raw.horizonYears ?? DEFAULT_HORIZON_YEARS;
  if (!Number.isFinite(horizonYears) || horizonYears < 0) throw new Error('horizonYears must be zero or more');
  if (raw.age !== undefined && !(raw.age >= 0 && raw.age <= 120)) throw new Error('age must be between 0 and 120');

  const monthlyExpenses = raw.monthlyExpenses ?? 0;
  if (!Number.isFinite(monthlyExpenses) || monthlyExpenses < 0) throw new Error('monthlyExpenses must be zero or more');
  const nearTermNeed = raw.nearTermNeed ?? 0;
  if (!Number.isFinite(nearTermNeed) || nearTermNeed < 0) throw new Error('nearTermNeed must be zero or more');

  const riskTolerance = raw.riskTolerance ?? DEFAULT_RISK_TOLERANCE;
  if (!(riskTolerance in RISK_PROFILES)) throw new Error(`unknown riskTolerance "${riskTolerance}"`);

  const asOf = raw.asOf ?? new Date().toISOString();
  if (Number.isNaN(new Date(asOf).getTime())) throw new Error('asOf is not a valid date');

  return {
    amount,
    riskTolerance,
    horizonYears,
    age: raw.age,
    monthlyExpenses,
    hasEmergencyFund: raw.hasEmergencyFund ?? true,
    nearTermNeed,
    needsIncome: raw.needsIncome ?? false,
    inflationProtection: raw.inflationProtection ?? true,
    includeInternational: raw.includeInternational ?? true,
    includeRealEstate: raw.includeRealEstate ?? false,
    includeGold: raw.includeGold ?? false,
    esg: raw.esg ?? false,
    accountType: raw.accountType ?? DEFAULT_ACCOUNT_TYPE,
    signals: raw.signals ?? [],
    asOf,
  };
}

// ---------------------------------------------------------------------------
// The allocator
// ---------------------------------------------------------------------------

/**
 * Produce an allocation plan the way a conservative planner would:
 *
 *  1. Set money aside first (emergency fund, near-term needs).
 *  2. Pick a top-level equity / bond / cash split from the risk profile,
 *     then cap it by horizon, age and the tool-wide ceiling.
 *  3. Apply bounded, asymmetric market signals (the news hook).
 *  4. Carve out small alternative sleeves if requested.
 *  5. Fill each sleeve with a diversified sub-mix.
 *  6. Fold away dust positions, round, and reconcile dollars to the cent.
 */
export function allocate(raw: AllocationInput): AllocationPlan {
  const input = resolveInput(raw);
  const notes: string[] = [];
  const warnings: string[] = [];
  const now = new Date(input.asOf);
  const h = input.horizonYears;

  // --- 1. Reserves --------------------------------------------------------
  let remaining = input.amount;
  let emergencyReserve = 0;
  if (!input.hasEmergencyFund) {
    if (input.monthlyExpenses > 0) {
      const target = EMERGENCY_FUND_MONTHS * input.monthlyExpenses;
      emergencyReserve = round2(Math.min(remaining, target));
      remaining = round2(remaining - emergencyReserve);
      notes.push(
        `Reserved ${money(emergencyReserve)} (${EMERGENCY_FUND_MONTHS} months of expenses) as an emergency fund before investing anything.`,
      );
      if (emergencyReserve < target) {
        warnings.push(
          `The amount entered does not cover a full ${EMERGENCY_FUND_MONTHS}-month emergency fund of ${money(target)}; everything was directed to reserves.`,
        );
      }
    } else {
      warnings.push(
        'No emergency fund is in place but monthly expenses were not provided, so nothing was reserved. Enter monthly expenses to size a 6-month reserve.',
      );
    }
  }

  let nearTermReserve = 0;
  if (input.nearTermNeed > 0) {
    nearTermReserve = round2(Math.min(remaining, input.nearTermNeed));
    remaining = round2(remaining - nearTermReserve);
    notes.push(
      `Parked ${money(nearTermReserve)} needed within about two years in Treasury bills. Money with a short horizon should not be exposed to market swings.`,
    );
    if (nearTermReserve < input.nearTermNeed) {
      warnings.push('The near-term need exceeds what remained after the emergency fund, so only part of it could be parked.');
    }
  }
  const investable = remaining;

  // --- 2. Top-level split -------------------------------------------------
  const profile = RISK_PROFILES[input.riskTolerance];
  const caps = [
    { value: horizonEquityCap(h), reason: `a ${h}-year horizon` },
    { value: ageEquityCap(input.age), reason: `the 100-minus-age rule at age ${input.age}` },
    { value: MAX_EQUITY, reason: 'the tool-wide equity ceiling' },
  ];
  const binding = caps.reduce((best, c) => (c.value < best.value ? c : best));
  const cap = binding.value;

  const bonus = horizonEquityBonus(h);
  let equity = profile.baseEquity + bonus;
  if (bonus > 0) notes.push(`Added ${pts(bonus)} of equity for a horizon of ${h} years.`);
  if (equity > cap) {
    notes.push(`Equity limited to ${pct(cap)} by ${binding.reason}; the ${profile.label.toLowerCase()} profile would otherwise start at ${pct(equity)}.`);
    equity = cap;
  }
  if (input.needsIncome) {
    const shift = Math.min(INCOME_EQUITY_SHIFT, equity);
    equity -= shift;
    notes.push(`Income goal: moved ${pts(shift)} from equity to bonds and tilted toward dividend stocks and investment-grade credit.`);
  }
  let cash = profile.cashBuffer;

  // --- 3. Signals ---------------------------------------------------------
  const ignored: IgnoredSignal[] = [];
  const relevant: MarketSignal[] = [];
  for (const s of input.signals) {
    if (s.dimension === 'international' && !input.includeInternational) {
      ignored.push({ id: s.id, reason: 'international equity is switched off' });
    } else if (s.dimension === 'inflation' && !input.inflationProtection) {
      ignored.push({ id: s.id, reason: 'inflation protection is switched off' });
    } else {
      relevant.push(s);
    }
  }
  const netted = netTilts(relevant, now);
  const { tilts } = netted;
  ignored.push(...netted.ignored);
  const effects: Partial<Record<SignalDimension, string>> = {};

  if (tilts.equity !== 0) {
    const rawShift = tilts.equity * SIGNAL_LIMITS.equity;
    const shift = rawShift > 0 ? rawShift * RISK_ON_SIGNAL_DAMPING : rawShift;
    const before = equity;
    equity = clamp(equity + shift, 0, cap);
    effects.equity =
      equity === before
        ? `no change (equity already at its ${pct(cap)} ceiling)`
        : `equity ${pct(before)} to ${pct(equity)}${rawShift > 0 ? ' (risk-on signals are honoured at half strength)' : ''}`;
  }

  if (tilts.cash !== 0) {
    const before = cash;
    cash = clamp(cash + tilts.cash * SIGNAL_LIMITS.cash, profile.cashBuffer / 2, profile.cashBuffer + SIGNAL_LIMITS.cash);
    const delta = cash - before;
    if (delta > 0) equity = Math.max(0, equity - delta); // raising cash is risk-off: fund it from equity
    effects.cash = `cash buffer ${pct(before)} to ${pct(cash)}${delta > 0 ? ', funded from equity' : ', released to bonds'}`;
  }

  let fixedIncome = 1 - equity - cash;

  // --- 4. Alternatives ----------------------------------------------------
  let reit = 0;
  let gold = 0;
  if (input.includeRealEstate && equity > 0) {
    reit = equity * EQUITY_MIX.reitShareOfEquity;
    equity -= reit;
    notes.push(`Real estate: ${pct(EQUITY_MIX.reitShareOfEquity)} of the equity sleeve moved into REITs.`);
  }
  if (input.includeGold) {
    const pool = equity + fixedIncome;
    if (pool > 0) {
      gold = Math.min(GOLD_WEIGHT, pool);
      equity -= gold * (equity / pool);
      fixedIncome -= gold * (fixedIncome / pool);
      notes.push(`Gold: a ${pct(gold)} hedge funded pro rata from stocks and bonds.`);
    }
  }

  // --- 5. Sub-allocations -------------------------------------------------
  const weights = new Map<AssetClassId, number>();
  const add = (id: AssetClassId, w: number) => {
    if (w > 0) weights.set(id, (weights.get(id) ?? 0) + w);
  };

  // Equity sleeve
  let usLarge: number;
  let usSmallMid: number;
  let intlDev = 0;
  let em = 0;
  let usDiv = 0;
  if (input.includeInternational) {
    const m = EQUITY_MIX.withInternational;
    usLarge = m.us_large;
    usSmallMid = m.us_small_mid;
    intlDev = m.intl_developed;
    em = m.emerging;
  } else {
    const m = EQUITY_MIX.domesticOnly;
    usLarge = m.us_large;
    usSmallMid = m.us_small_mid;
  }
  if (!profile.allowEmerging && em > 0) {
    intlDev += em;
    em = 0;
    notes.push('Emerging markets omitted for the very conservative profile; their share went to developed international.');
  }
  if (input.includeInternational && tilts.international !== 0) {
    const move = clamp(tilts.international * SIGNAL_LIMITS.international, -intlDev, usLarge);
    intlDev += move;
    usLarge -= move;
    effects.international = `${move >= 0 ? 'moved' : 'moved back'} ${pts(Math.abs(move))} of the equity sleeve ${move >= 0 ? 'from U.S. to international' : 'from international to U.S.'}`;
  }
  if (input.needsIncome) {
    usDiv = usLarge * EQUITY_MIX.dividendShareOfUsLarge;
    usLarge -= usDiv;
  }
  add('us_large', equity * usLarge);
  add('us_dividend', equity * usDiv);
  add('us_small_mid', equity * usSmallMid);
  add('intl_developed', equity * intlDev);
  add('emerging', equity * em);

  // Fixed-income sleeve
  const base = h < BOND_MIX.shortHorizonYears ? BOND_MIX.shortHorizon : BOND_MIX.standard;
  let shortT: number = base.short_treasury;
  let coreB: number = base.intermediate_bond;
  let tips: number = base.tips;
  let igCorp = 0;
  if (h < BOND_MIX.shortHorizonYears) notes.push('Bond sleeve tilted to short maturities because the horizon is under four years.');
  if (!input.inflationProtection) {
    coreB += tips;
    tips = 0;
  }
  if (input.needsIncome) {
    igCorp = Math.min(BOND_MIX.corporateShareForIncome, coreB);
    coreB -= igCorp;
  }
  if (tilts.duration !== 0) {
    const move = clamp(tilts.duration * SIGNAL_LIMITS.duration, -coreB, shortT);
    shortT -= move;
    coreB += move;
    effects.duration = `${move >= 0 ? 'lengthened' : 'shortened'} duration: ${pts(Math.abs(move))} of the bond sleeve ${move >= 0 ? 'from short Treasuries to core bonds' : 'from core bonds to short Treasuries'}`;
  }
  if (input.inflationProtection && tilts.inflation !== 0) {
    const move = clamp(tilts.inflation * SIGNAL_LIMITS.inflation, -tips, coreB);
    coreB -= move;
    tips += move;
    effects.inflation = `${pts(Math.abs(move))} of the bond sleeve ${move >= 0 ? 'from core bonds to TIPS' : 'from TIPS to core bonds'}`;
  }
  add('short_treasury', fixedIncome * shortT);
  add('intermediate_bond', fixedIncome * coreB);
  add('tips', fixedIncome * tips);
  add('ig_corporate', fixedIncome * igCorp);

  add('cash_hysa', cash);
  add('reit', reit);
  add('gold', gold);

  // --- 6. Fold dust, normalise, round ------------------------------------
  foldSmallPositions(weights, notes);

  const totalW = [...weights.values()].reduce((a, b) => a + b, 0);
  for (const [id, w] of weights) weights.set(id, w / totalW);

  const rounded = new Map<AssetClassId, number>();
  for (const [id, w] of weights) rounded.set(id, Math.round(w * 100) / 100);
  fixResidual(rounded, 1, 1e-9);

  const dollars = new Map<AssetClassId, number>();
  for (const [id, w] of rounded) dollars.set(id, round2(w * investable));
  fixResidual(dollars, investable, 0.005);

  // --- 7. Lines -----------------------------------------------------------
  const lines: AllocationLine[] = [];
  if (emergencyReserve > 0) {
    lines.push({
      role: 'emergency_fund',
      assetClass: 'cash_hysa',
      name: 'Emergency fund',
      bucket: 'reserves',
      weightOfTotal: emergencyReserve / input.amount,
      weightOfInvested: null,
      dollars: emergencyReserve,
      examples: ASSET_CLASSES.cash_hysa.examples,
      rationale: `${EMERGENCY_FUND_MONTHS} months of expenses in fully liquid, insured cash. This is not invested.`,
    });
  }
  if (nearTermReserve > 0) {
    lines.push({
      role: 'near_term',
      assetClass: 'tbills',
      name: 'Near-term spending (T-bills)',
      bucket: 'reserves',
      weightOfTotal: nearTermReserve / input.amount,
      weightOfInvested: null,
      dollars: nearTermReserve,
      examples: ASSET_CLASSES.tbills.examples,
      rationale: 'Money needed within about two years, held in Treasury bills so it cannot lose value when it is needed.',
    });
  }
  const catalogOrder = Object.keys(ASSET_CLASSES) as AssetClassId[];
  for (const bucket of BUCKET_ORDER) {
    for (const id of catalogOrder) {
      const ac = ASSET_CLASSES[id];
      if (ac.bucket !== bucket || !dollars.has(id)) continue;
      const d = dollars.get(id)!;
      if (d <= 0) continue;
      lines.push({
        role: 'portfolio',
        assetClass: id,
        name: ac.name,
        bucket,
        weightOfTotal: d / input.amount,
        weightOfInvested: rounded.get(id)!,
        dollars: d,
        examples: examplesFor(id, input.esg),
        rationale: ac.description,
      });
    }
  }

  // --- 8. Summaries -------------------------------------------------------
  const buckets: BucketSummary[] = BUCKET_ORDER.flatMap((bucket) => {
    const bl = lines.filter((l) => l.bucket === bucket);
    if (bl.length === 0) return [];
    const d = round2(bl.reduce((a, l) => a + l.dollars, 0));
    return [{ bucket, label: BUCKET_LABELS[bucket], weightOfTotal: d / input.amount, dollars: d }];
  });
  const investedWeight = (bucket: Bucket) =>
    lines.filter((l) => l.bucket === bucket).reduce((a, l) => a + (l.weightOfInvested ?? 0), 0);

  if (investable <= 0) {
    warnings.push('Nothing is left to invest after reserves. Revisit once the emergency fund and near-term needs are covered.');
  } else if (investable < SMALL_PORTFOLIO_THRESHOLD) {
    notes.push(
      `With ${money(investable)} to invest, a single low-cost balanced or target-date fund with a similar stock/bond split is usually simpler than holding each line separately.`,
    );
  }
  notes.push(accountNote(input.accountType));
  if (input.esg) notes.push('ESG preference: example funds were swapped for screened equivalents where a mainstream one exists.');

  const risk = portfolioRisk(lines);
  const applied: AppliedSignal[] = netted.applied.map((s) => ({
    id: s.id,
    dimension: s.dimension,
    effect: effects[s.dimension] ?? 'no net effect',
  }));

  return {
    generatedAt: now.toISOString(),
    input,
    lines,
    buckets,
    summary: {
      totalAmount: input.amount,
      reservesDollars: round2(emergencyReserve + nearTermReserve),
      investableDollars: investable,
      equityWeight: investedWeight('equity'),
      fixedIncomeWeight: investedWeight('fixed_income'),
      cashWeight: investedWeight('cash'),
      alternativesWeight: investedWeight('alternatives'),
      equityCap: cap,
      equityCapReason: binding.reason,
      expectedReturn: risk.expectedReturn,
      expectedVolatility: risk.volatility,
      typicalBadYear: risk.typicalBadYear,
    },
    rebalancing: {
      frequency: REBALANCING.frequency,
      absoluteBand: REBALANCING.absoluteBand,
      relativeBand: REBALANCING.relativeBand,
      description:
        `${REBALANCING.frequency}. Rebalance a sleeve when it drifts more than ${pts(REBALANCING.absoluteBand)} ` +
        `or ${pct(REBALANCING.relativeBand)} of its own target, whichever is smaller. Direct new contributions to underweight sleeves first.`,
    },
    notes,
    warnings,
    signals: { applied, ignored },
    disclaimer: DISCLAIMER,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Where a too-small position's money goes: back to the sleeve that funded it. */
function foldTargetBucket(id: AssetClassId): Bucket {
  if (id === 'reit') return 'equity';
  if (id === 'gold') return 'fixed_income';
  return ASSET_CLASSES[id].bucket;
}

function foldSmallPositions(weights: Map<AssetClassId, number>, notes: string[]): void {
  for (const [id, w] of [...weights]) {
    if (id === 'cash_hysa') continue; // the buffer is small by design
    if (w <= 0) {
      weights.delete(id);
      continue;
    }
    if (w >= MIN_POSITION_WEIGHT) continue;

    const wanted = foldTargetBucket(id);
    const candidates = [...weights].filter(([other]) => other !== id);
    const sameBucket = candidates.filter(([other]) => ASSET_CLASSES[other].bucket === wanted);
    const pool = sameBucket.length > 0 ? sameBucket : candidates.filter(([other]) => other !== 'cash_hysa');
    if (pool.length === 0) continue;
    const [target] = pool.reduce((best, c) => (c[1] > best[1] ? c : best));

    weights.set(target, weights.get(target)! + w);
    weights.delete(id);
    notes.push(
      `${ASSET_CLASSES[id].shortName} would be under ${pct(MIN_POSITION_WEIGHT)} of the portfolio, so it was folded into ${ASSET_CLASSES[target].shortName.toLowerCase()}.`,
    );
  }
}

/** Push any rounding residual onto the largest entry so the map sums to `target` exactly. */
function fixResidual(map: Map<AssetClassId, number>, target: number, tolerance: number): void {
  if (map.size === 0) return;
  const sum = [...map.values()].reduce((a, b) => a + b, 0);
  const residual = target - sum;
  if (Math.abs(residual) <= tolerance) return;
  const [largest] = [...map].reduce((best, c) => (c[1] > best[1] ? c : best));
  map.set(largest, round2(map.get(largest)! + residual));
}

function accountNote(accountType: ResolvedInput['accountType']): string {
  switch (accountType) {
    case 'taxable':
      return 'Taxable account: check whether municipal bonds beat the after-tax yield of the core bond position, and if you also have tax-advantaged accounts, hold bonds and REITs there first.';
    case 'tax_deferred':
      return 'Tax-deferred account (401(k)/traditional IRA): bonds and REITs are well placed here since their income is sheltered until withdrawal.';
    case 'tax_free':
      return 'Tax-free account (Roth): the highest-growth assets belong here, since gains are never taxed.';
  }
}
