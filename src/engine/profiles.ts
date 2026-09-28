import type { AccountType, RiskTolerance, SignalDimension } from './types';

/**
 * Planner rules of thumb. Everything that makes the engine "conservative"
 * lives here so it can be reviewed and tuned in one place.
 */

export interface RiskProfile {
  label: string;
  description: string;
  /** Starting equity share of the invested portfolio before caps/tilts. */
  baseEquity: number;
  /** Cash held inside the invested portfolio for liquidity and rebalancing. */
  cashBuffer: number;
  /** Whether emerging markets are included at all. */
  allowEmerging: boolean;
}

export const RISK_PROFILES: Record<RiskTolerance, RiskProfile> = {
  very_conservative: {
    label: 'Very conservative',
    description: 'Capital preservation first. Small equity sleeve, no emerging markets, larger cash buffer.',
    baseEquity: 0.2,
    cashBuffer: 0.05,
    allowEmerging: false,
  },
  conservative: {
    label: 'Conservative',
    description: 'Steady growth with limited drawdowns. Bonds are the majority of the portfolio.',
    baseEquity: 0.35,
    cashBuffer: 0.04,
    allowEmerging: true,
  },
  moderate: {
    label: 'Moderate',
    description: 'A classic balanced mix. Accepts moderate swings for higher long-run growth.',
    baseEquity: 0.5,
    cashBuffer: 0.03,
    allowEmerging: true,
  },
  growth: {
    label: 'Growth',
    description: 'The most equity this tool will suggest. Still holds a meaningful bond floor.',
    baseEquity: 0.65,
    cashBuffer: 0.02,
    allowEmerging: true,
  },
};

export const DEFAULT_RISK_TOLERANCE: RiskTolerance = 'conservative';
export const DEFAULT_HORIZON_YEARS = 10;
export const DEFAULT_ACCOUNT_TYPE: AccountType = 'taxable';

/** Hard ceiling on equity regardless of inputs or signals. */
export const MAX_EQUITY = 0.7;

/** Months of expenses carved out when no emergency fund exists. */
export const EMERGENCY_FUND_MONTHS = 6;

/** Positions smaller than this share of the invested portfolio are folded into a sibling. */
export const MIN_POSITION_WEIGHT = 0.02;

/** Below this total, a single balanced fund is usually simpler than a multi-line plan. */
export const SMALL_PORTFOLIO_THRESHOLD = 2_500;

/** Equity ceiling implied by when the money is needed. */
export function horizonEquityCap(years: number): number {
  if (years < 2) return 0.1;
  if (years < 4) return 0.25;
  if (years < 7) return 0.4;
  if (years < 12) return 0.55;
  return MAX_EQUITY;
}

/** Small reward for genuinely long horizons; still subject to every cap. */
export function horizonEquityBonus(years: number): number {
  return years >= 20 ? 0.05 : 0;
}

/**
 * Conservative age rule: equity no higher than (100 - age)%, floored so a
 * retiree still keeps some growth assets against longevity risk.
 */
export function ageEquityCap(age: number | undefined): number {
  if (age === undefined || Number.isNaN(age)) return MAX_EQUITY;
  const cap = (100 - age) / 100;
  return Math.min(MAX_EQUITY, Math.max(0.15, cap));
}

/** Points moved from equity to bonds when the investor needs income. */
export const INCOME_EQUITY_SHIFT = 0.05;

/** Equity sub-mix (fractions of the equity sleeve). */
export const EQUITY_MIX = {
  withInternational: { us_large: 0.58, us_small_mid: 0.1, intl_developed: 0.24, emerging: 0.08 },
  domesticOnly: { us_large: 0.88, us_small_mid: 0.12 },
  /** Share of us_large re-routed to dividend equity when income is a goal. */
  dividendShareOfUsLarge: 0.5,
  /** Share of the equity sleeve re-routed to REITs when real estate is on. */
  reitShareOfEquity: 0.1,
} as const;

/** Fixed-income sub-mix (fractions of the bond sleeve). */
export const BOND_MIX = {
  standard: { short_treasury: 0.35, intermediate_bond: 0.45, tips: 0.2 },
  shortHorizon: { short_treasury: 0.6, intermediate_bond: 0.25, tips: 0.15 },
  /** Horizons under this many years use the shortHorizon mix. */
  shortHorizonYears: 4,
  /** Share of the bond sleeve moved from core bonds to IG corporates when income is a goal. */
  corporateShareForIncome: 0.2,
} as const;

/** Maximum gold weight of the invested portfolio. */
export const GOLD_WEIGHT = 0.05;

/**
 * Maximum absolute shift a fully-agreeing set of signals can produce.
 * equity/cash are points of the invested portfolio; the others are points
 * inside their sleeve.
 */
export const SIGNAL_LIMITS: Record<SignalDimension, number> = {
  equity: 0.05,
  cash: 0.03,
  duration: 0.1,
  inflation: 0.1,
  international: 0.05,
};

/**
 * Conservative asymmetry: signals that argue for MORE equity are honoured at
 * half strength; signals that argue for less are honoured in full.
 */
export const RISK_ON_SIGNAL_DAMPING = 0.5;

export const REBALANCING = {
  frequency: 'Review semi-annually; act only when a band is breached',
  absoluteBand: 0.05,
  relativeBand: 0.25,
} as const;

export const DISCLAIMER =
  'This is an educational model allocation generated from rules of thumb and stated assumptions. ' +
  'It is not personalised investment, tax or legal advice, and the example funds are illustrations of each ' +
  'category rather than recommendations. Past performance and assumed returns do not predict future results. ' +
  'Consider consulting a licensed financial adviser before acting.';
