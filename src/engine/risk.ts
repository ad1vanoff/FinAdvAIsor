import { ASSET_CLASSES } from './catalog';
import type { AllocationLine, AssetGroup } from './types';

/**
 * A deliberately simple risk model: asset-class volatilities from the
 * catalogue and a coarse group-level correlation matrix. Good enough for a
 * "roughly how bumpy is this?" summary, not for optimisation.
 */
const GROUP_CORRELATION: Record<AssetGroup, Record<AssetGroup, number>> = {
  cash: { cash: 1, bond: 0.1, equity: 0, gold: 0 },
  bond: { cash: 0.1, bond: 0.75, equity: 0.1, gold: 0.15 },
  equity: { cash: 0, bond: 0.1, equity: 0.85, gold: 0.1 },
  gold: { cash: 0, bond: 0.15, equity: 0.1, gold: 1 },
};

export interface PortfolioRisk {
  expectedReturn: number;
  volatility: number;
  typicalBadYear: number;
}

/** Weights are taken from `weightOfTotal`, so reserves count as cash-like ballast. */
export function portfolioRisk(lines: AllocationLine[]): PortfolioRisk {
  let expectedReturn = 0;
  let variance = 0;

  for (const a of lines) {
    const ca = ASSET_CLASSES[a.assetClass];
    expectedReturn += a.weightOfTotal * ca.assumptions.expectedReturn;
    for (const b of lines) {
      const cb = ASSET_CLASSES[b.assetClass];
      const rho = ca.id === cb.id ? 1 : GROUP_CORRELATION[ca.group][cb.group];
      variance += a.weightOfTotal * b.weightOfTotal * rho * ca.assumptions.volatility * cb.assumptions.volatility;
    }
  }

  const volatility = Math.sqrt(Math.max(0, variance));
  return {
    expectedReturn,
    volatility,
    typicalBadYear: expectedReturn - 2 * volatility,
  };
}
