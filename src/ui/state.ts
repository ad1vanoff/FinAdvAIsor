import { DEMO_SIGNALS } from '../engine';
import type { AccountType, AllocationInput, Answers, MarketSignal, RiskTolerance } from '../engine';

export type StepId = 'basics' | 'safety' | 'risk' | 'preferences' | 'building' | 'plan';

export const STEPS: { id: StepId; label: string }[] = [
  { id: 'basics', label: 'Basics' },
  { id: 'safety', label: 'Safety net' },
  { id: 'risk', label: 'Risk profile' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'plan', label: 'Your plan' },
];

/** 'building' is the transition into the plan, so it shares the plan's slot in the progress bar. */
export const stepIndex = (id: StepId): number => STEPS.findIndex((s) => s.id === (id === 'building' ? 'plan' : id));

export interface Basics {
  amount: string;
  horizonYears: number;
  age: string;
}

export interface Safety {
  hasEmergencyFund: boolean | null;
  monthlyExpenses: string;
  hasNearTerm: boolean | null;
  nearTermNeed: string;
}

export interface Prefs {
  needsIncome: boolean;
  inflationProtection: boolean;
  includeInternational: boolean;
  includeRealEstate: boolean;
  includeGold: boolean;
  esg: boolean;
  accountType: AccountType;
}

export interface WizardState {
  step: StepId;
  /** Furthest step index the user has reached, so earlier steps can be revisited freely. */
  reached: number;
  /** Which risk question is on screen. */
  riskIndex: number;
  basics: Basics;
  safety: Safety;
  answers: Answers;
  prefs: Prefs;
  /** A profile chosen on the results page instead of the questionnaire's. */
  overrideRisk: RiskTolerance | null;
  signalIds: string[];
  /** Opt in to signals derived from validated research data. Off by default. */
  researchSignals: boolean;
}

export const INITIAL: WizardState = {
  step: 'basics',
  reached: 0,
  riskIndex: 0,
  basics: { amount: '', horizonYears: 10, age: '' },
  safety: { hasEmergencyFund: null, monthlyExpenses: '', hasNearTerm: null, nearTermNeed: '' },
  answers: {},
  prefs: {
    needsIncome: false,
    inflationProtection: true,
    includeInternational: true,
    includeRealEstate: false,
    includeGold: false,
    esg: false,
    accountType: 'taxable',
  },
  overrideRisk: null,
  signalIds: [],
  researchSignals: false,
};

/** Blank -> undefined; garbage -> NaN; otherwise the number (commas and $ allowed). */
export function parseMoney(s: string): number | undefined {
  const t = s.trim();
  if (t === '') return undefined;
  const n = Number(t.replace(/[$,_\s]/g, ''));
  return Number.isNaN(n) ? Number.NaN : n;
}

export type Errors<T> = Partial<Record<keyof T, string>>;

export function validateBasics(b: Basics): Errors<Basics> {
  const e: Errors<Basics> = {};
  const amount = parseMoney(b.amount);
  if (amount === undefined || Number.isNaN(amount) || amount <= 0) e.amount = 'Enter an amount greater than zero.';
  const age = parseMoney(b.age);
  if (age !== undefined && !(age >= 0 && age <= 120)) e.age = 'Age must be between 0 and 120.';
  return e;
}

export function validateSafety(s: Safety): Errors<Safety> {
  const e: Errors<Safety> = {};
  if (s.hasEmergencyFund === null) e.hasEmergencyFund = 'Choose one.';
  if (s.hasEmergencyFund === false) {
    const m = parseMoney(s.monthlyExpenses);
    if (m === undefined || Number.isNaN(m) || m <= 0) e.monthlyExpenses = 'Enter your rough monthly expenses so the reserve can be sized.';
  }
  if (s.hasNearTerm === null) e.hasNearTerm = 'Choose one.';
  if (s.hasNearTerm === true) {
    const n = parseMoney(s.nearTermNeed);
    if (n === undefined || Number.isNaN(n) || n <= 0) e.nearTermNeed = 'Enter the amount you will need.';
  }
  return e;
}

export function toAllocationInput(state: WizardState, riskTolerance: RiskTolerance, researchSignals: MarketSignal[] = []): AllocationInput {
  const signals: MarketSignal[] = [...state.signalIds.map((id) => DEMO_SIGNALS[id]).filter(Boolean), ...(state.researchSignals ? researchSignals : [])];
  return {
    amount: parseMoney(state.basics.amount) ?? Number.NaN,
    riskTolerance,
    horizonYears: state.basics.horizonYears,
    age: parseMoney(state.basics.age),
    hasEmergencyFund: state.safety.hasEmergencyFund ?? true,
    monthlyExpenses: state.safety.hasEmergencyFund === false ? parseMoney(state.safety.monthlyExpenses) : undefined,
    nearTermNeed: state.safety.hasNearTerm ? parseMoney(state.safety.nearTermNeed) : undefined,
    ...state.prefs,
    signals,
  };
}

const KEY = 'finadvaisor.wizard.v2';

export function loadState(): WizardState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return INITIAL;
    const saved = JSON.parse(raw) as Partial<WizardState>;
    return {
      ...INITIAL,
      ...saved,
      basics: { ...INITIAL.basics, ...saved.basics },
      safety: { ...INITIAL.safety, ...saved.safety },
      prefs: { ...INITIAL.prefs, ...saved.prefs },
      answers: saved.answers ?? {},
      signalIds: saved.signalIds ?? [],
      researchSignals: saved.researchSignals ?? false,
    };
  } catch {
    return INITIAL;
  }
}

export function saveState(state: WizardState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable; the flow still works for this session */
  }
}
