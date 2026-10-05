/**
 * Rough range of outcomes for a lump sum, from the plan's expected return and
 * volatility, using a lognormal growth model. The percentiles describe the
 * shape of the risk under the stated assumptions; they are not a forecast.
 */
export interface ProjectionPoint {
  year: number;
  /** 10th percentile: one bad path in ten does worse than this. */
  p10: number;
  /** Median path. */
  p50: number;
  /** 90th percentile: one good path in ten does better than this. */
  p90: number;
}

const Z90 = 1.2815515655446004;

export function projectGrowth(start: number, expectedReturn: number, volatility: number, years: number): ProjectionPoint[] {
  if (!(start >= 0) || !Number.isFinite(expectedReturn) || !(volatility >= 0) || !(years >= 0)) {
    throw new Error('projection inputs must be non-negative and finite');
  }
  const n = Math.round(years);
  const sigma = volatility;
  const mu = Math.log(1 + expectedReturn) - (sigma * sigma) / 2;
  const points: ProjectionPoint[] = [];
  for (let t = 0; t <= n; t++) {
    const drift = mu * t;
    const spread = sigma * Math.sqrt(t);
    points.push({
      year: t,
      p10: start * Math.exp(drift - Z90 * spread),
      p50: start * Math.exp(drift),
      p90: start * Math.exp(drift + Z90 * spread),
    });
  }
  return points;
}
