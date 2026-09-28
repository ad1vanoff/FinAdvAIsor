/**
 * Core types for the allocation engine.
 *
 * Design notes
 * - Everything is expressed as plain data so the engine stays pure and testable.
 * - Weights are fractions (0.35 = 35%), never percentages.
 * - Dollar amounts are in the user's currency, rounded to cents by the engine.
 */

export type RiskTolerance = 'very_conservative' | 'conservative' | 'moderate' | 'growth';

export type AccountType = 'taxable' | 'tax_deferred' | 'tax_free';

/** Top-level sleeve a line belongs to. */
export type Bucket = 'reserves' | 'cash' | 'fixed_income' | 'equity' | 'alternatives';

/** Coarse factor group, used for the simple correlation model in risk.ts. */
export type AssetGroup = 'cash' | 'bond' | 'equity' | 'gold';

export type AssetClassId =
  | 'cash_hysa'
  | 'tbills'
  | 'short_treasury'
  | 'intermediate_bond'
  | 'tips'
  | 'ig_corporate'
  | 'us_large'
  | 'us_dividend'
  | 'us_small_mid'
  | 'intl_developed'
  | 'emerging'
  | 'reit'
  | 'gold';

/** Why a line exists: money set aside before investing, or part of the invested portfolio. */
export type LineRole = 'emergency_fund' | 'near_term' | 'portfolio';

export interface InstrumentExample {
  ticker: string;
  name: string;
}

/** Long-run, nominal, annualised assumptions. Rough and clearly labelled as such in output. */
export interface CapitalMarketAssumption {
  expectedReturn: number;
  volatility: number;
}

export interface AssetClass {
  id: AssetClassId;
  name: string;
  shortName: string;
  bucket: Bucket;
  group: AssetGroup;
  description: string;
  examples: InstrumentExample[];
  esgExamples?: InstrumentExample[];
  assumptions: CapitalMarketAssumption;
}

// ---------------------------------------------------------------------------
// Signals (the hook for the future news-driven layer)
// ---------------------------------------------------------------------------

/**
 * A dimension the news layer is allowed to nudge. Each maps to a bounded
 * shift inside the engine, so no signal can push the plan outside its guardrails.
 */
export type SignalDimension = 'equity' | 'duration' | 'inflation' | 'international' | 'cash';

export interface MarketSignal {
  id: string;
  /** Where the signal came from, e.g. "manual", "news:reuters", "model:macro-v1". */
  source: string;
  /** ISO date the signal was produced. */
  asOf: string;
  dimension: SignalDimension;
  /** +1 = increase exposure to the dimension, -1 = decrease. */
  direction: 1 | -1;
  /** 0..1, how large the recommended move is. */
  strength: number;
  /** 0..1, how sure the source is. */
  confidence: number;
  rationale: string;
  /** ISO date after which the signal is ignored. */
  expiresAt?: string;
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface AllocationInput {
  /** Total dollars available to allocate. Must be > 0. */
  amount: number;
  /** Default: 'conservative'. There is deliberately no "aggressive" option. */
  riskTolerance?: RiskTolerance;
  /** Years until the money is likely needed. Default: 10. */
  horizonYears?: number;
  /** Optional. Used only to cap equity via a conservative age rule. */
  age?: number;
  /** Used to size the emergency fund when hasEmergencyFund is false. */
  monthlyExpenses?: number;
  /** Default: true. When false and monthlyExpenses is given, 6 months are carved out first. */
  hasEmergencyFund?: boolean;
  /** Dollars needed within ~2 years; parked in T-bills before anything is invested. */
  nearTermNeed?: number;
  /** Tilt toward income: more bonds, dividend equity, investment-grade credit. */
  needsIncome?: boolean;
  /** Default: true. Include TIPS in the bond sleeve. */
  inflationProtection?: boolean;
  /** Default: true. */
  includeInternational?: boolean;
  /** Default: false. Adds a REIT slice funded from equity. */
  includeRealEstate?: boolean;
  /** Default: false. Adds a small gold slice (max 5%) funded pro rata. */
  includeGold?: boolean;
  /** Default: false. Swaps example instruments for ESG-screened equivalents. */
  esg?: boolean;
  /** Default: 'taxable'. Affects notes only for now. */
  accountType?: AccountType;
  /** Optional market/news signals. Bounded and guardrailed by the engine. */
  signals?: MarketSignal[];
  /** ISO date used for signal expiry. Default: now. */
  asOf?: string;
}

export interface ResolvedInput {
  amount: number;
  riskTolerance: RiskTolerance;
  horizonYears: number;
  age?: number;
  monthlyExpenses: number;
  hasEmergencyFund: boolean;
  nearTermNeed: number;
  needsIncome: boolean;
  inflationProtection: boolean;
  includeInternational: boolean;
  includeRealEstate: boolean;
  includeGold: boolean;
  esg: boolean;
  accountType: AccountType;
  signals: MarketSignal[];
  asOf: string;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface AllocationLine {
  role: LineRole;
  assetClass: AssetClassId;
  name: string;
  bucket: Bucket;
  /** Fraction of the total amount entered. */
  weightOfTotal: number;
  /** Fraction of the invested portfolio (excludes reserves). Null for reserve lines. */
  weightOfInvested: number | null;
  dollars: number;
  examples: InstrumentExample[];
  rationale: string;
}

export interface BucketSummary {
  bucket: Bucket;
  label: string;
  weightOfTotal: number;
  dollars: number;
}

export interface PlanSummary {
  totalAmount: number;
  reservesDollars: number;
  investableDollars: number;
  /** All four are fractions of the invested portfolio. */
  equityWeight: number;
  fixedIncomeWeight: number;
  cashWeight: number;
  alternativesWeight: number;
  /** The binding equity ceiling and why it applied. */
  equityCap: number;
  equityCapReason: string;
  /** Rough, assumption-driven, whole-plan figures (fractions of total). */
  expectedReturn: number;
  expectedVolatility: number;
  /** Approximate return in a bad year (mean minus two standard deviations). */
  typicalBadYear: number;
}

export interface RebalancingPolicy {
  frequency: string;
  /** Rebalance when a sleeve drifts this many points from target (e.g. 0.05). */
  absoluteBand: number;
  /** ...or this fraction of its own target (e.g. 0.25), whichever is smaller. */
  relativeBand: number;
  description: string;
}

export interface AppliedSignal {
  id: string;
  dimension: SignalDimension;
  effect: string;
}

export interface IgnoredSignal {
  id: string;
  reason: string;
}

export interface AllocationPlan {
  generatedAt: string;
  input: ResolvedInput;
  lines: AllocationLine[];
  buckets: BucketSummary[];
  summary: PlanSummary;
  rebalancing: RebalancingPolicy;
  notes: string[];
  warnings: string[];
  signals: { applied: AppliedSignal[]; ignored: IgnoredSignal[] };
  disclaimer: string;
}
