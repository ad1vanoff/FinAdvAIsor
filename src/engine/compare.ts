import { allocate } from './allocate';
import { RISK_PROFILES } from './profiles';
import type { AllocationInput, RiskTolerance } from './types';

export interface ProfileComparison {
  riskTolerance: RiskTolerance;
  label: string;
  equityWeight: number;
  expectedReturn: number;
  volatility: number;
  typicalBadYear: number;
}

/** The same inputs run through every risk profile, so the user can see where theirs sits. */
export function compareProfiles(input: AllocationInput): ProfileComparison[] {
  return (Object.keys(RISK_PROFILES) as RiskTolerance[]).map((riskTolerance) => {
    const plan = allocate({ ...input, riskTolerance });
    return {
      riskTolerance,
      label: RISK_PROFILES[riskTolerance].label,
      equityWeight: plan.summary.equityWeight,
      expectedReturn: plan.summary.expectedReturn,
      volatility: plan.summary.expectedVolatility,
      typicalBadYear: plan.summary.typicalBadYear,
    };
  });
}
