import type { AssetClass, AssetClassId, Bucket } from './types';

/**
 * Asset-class catalogue.
 *
 * Example instruments are well-known, low-cost index funds in each category.
 * They illustrate what the category means; they are not recommendations and
 * the engine never assumes any particular one is held.
 *
 * Capital-market assumptions are deliberately round, long-run, nominal figures
 * in the spirit of what large planners publish. They drive the rough
 * expected-return / volatility summary only, never the allocation itself.
 */
export const ASSET_CLASSES: Record<AssetClassId, AssetClass> = {
  cash_hysa: {
    id: 'cash_hysa',
    name: 'Cash (high-yield savings / money market)',
    shortName: 'Cash',
    bucket: 'cash',
    group: 'cash',
    description: 'Fully liquid, FDIC-insured or government money market. Earns a modest yield with no price risk.',
    examples: [
      { ticker: 'HYSA', name: 'FDIC-insured high-yield savings account' },
      { ticker: 'VMFXX', name: 'Vanguard Federal Money Market Fund' },
    ],
    assumptions: { expectedReturn: 0.035, volatility: 0.005 },
  },
  tbills: {
    id: 'tbills',
    name: 'Treasury bills (0-3 months)',
    shortName: 'T-bills',
    bucket: 'reserves',
    group: 'cash',
    description: 'Ultra-short government paper. Near-zero price risk, state-tax-exempt interest.',
    examples: [
      { ticker: 'SGOV', name: 'iShares 0-3 Month Treasury Bond ETF' },
      { ticker: 'BIL', name: 'SPDR Bloomberg 1-3 Month T-Bill ETF' },
    ],
    assumptions: { expectedReturn: 0.035, volatility: 0.005 },
  },
  short_treasury: {
    id: 'short_treasury',
    name: 'Short-term Treasuries (1-3 yr)',
    shortName: 'Short Treasuries',
    bucket: 'fixed_income',
    group: 'bond',
    description: 'Government bonds with little interest-rate sensitivity. The defensive core of the bond sleeve.',
    examples: [
      { ticker: 'VGSH', name: 'Vanguard Short-Term Treasury ETF' },
      { ticker: 'SCHO', name: 'Schwab Short-Term U.S. Treasury ETF' },
    ],
    assumptions: { expectedReturn: 0.038, volatility: 0.02 },
  },
  intermediate_bond: {
    id: 'intermediate_bond',
    name: 'Intermediate investment-grade bonds',
    shortName: 'Core bonds',
    bucket: 'fixed_income',
    group: 'bond',
    description: 'Broad U.S. aggregate: Treasuries, agency mortgages and high-quality corporates, ~6 year duration.',
    examples: [
      { ticker: 'BND', name: 'Vanguard Total Bond Market ETF' },
      { ticker: 'AGG', name: 'iShares Core U.S. Aggregate Bond ETF' },
    ],
    esgExamples: [{ ticker: 'EAGG', name: 'iShares ESG Aware U.S. Aggregate Bond ETF' }],
    assumptions: { expectedReturn: 0.043, volatility: 0.05 },
  },
  tips: {
    id: 'tips',
    name: 'Inflation-protected Treasuries (TIPS)',
    shortName: 'TIPS',
    bucket: 'fixed_income',
    group: 'bond',
    description: 'Principal adjusts with CPI, protecting purchasing power if inflation surprises to the upside.',
    examples: [
      { ticker: 'SCHP', name: 'Schwab U.S. TIPS ETF' },
      { ticker: 'VTIP', name: 'Vanguard Short-Term Inflation-Protected Securities ETF' },
    ],
    assumptions: { expectedReturn: 0.04, volatility: 0.05 },
  },
  ig_corporate: {
    id: 'ig_corporate',
    name: 'Investment-grade corporate bonds',
    shortName: 'IG corporates',
    bucket: 'fixed_income',
    group: 'bond',
    description: 'Higher yield than Treasuries in exchange for modest credit risk. Used only when income is a goal.',
    examples: [
      { ticker: 'VCIT', name: 'Vanguard Intermediate-Term Corporate Bond ETF' },
      { ticker: 'LQD', name: 'iShares iBoxx $ Investment Grade Corporate Bond ETF' },
    ],
    assumptions: { expectedReturn: 0.048, volatility: 0.065 },
  },
  us_large: {
    id: 'us_large',
    name: 'U.S. large-cap / total market equity',
    shortName: 'U.S. stocks',
    bucket: 'equity',
    group: 'equity',
    description: 'Broad, diversified U.S. stock exposure. The growth engine of the portfolio.',
    examples: [
      { ticker: 'VTI', name: 'Vanguard Total Stock Market ETF' },
      { ticker: 'VOO', name: 'Vanguard S&P 500 ETF' },
    ],
    esgExamples: [{ ticker: 'ESGV', name: 'Vanguard ESG U.S. Stock ETF' }],
    assumptions: { expectedReturn: 0.07, volatility: 0.16 },
  },
  us_dividend: {
    id: 'us_dividend',
    name: 'U.S. dividend equity',
    shortName: 'Dividend stocks',
    bucket: 'equity',
    group: 'equity',
    description: 'Established, cash-generating companies. Slightly lower volatility, steadier income.',
    examples: [
      { ticker: 'SCHD', name: 'Schwab U.S. Dividend Equity ETF' },
      { ticker: 'VYM', name: 'Vanguard High Dividend Yield ETF' },
    ],
    assumptions: { expectedReturn: 0.065, volatility: 0.14 },
  },
  us_small_mid: {
    id: 'us_small_mid',
    name: 'U.S. small & mid-cap equity',
    shortName: 'U.S. small/mid',
    bucket: 'equity',
    group: 'equity',
    description: 'Smaller companies with higher long-run return potential and higher volatility. Kept small.',
    examples: [
      { ticker: 'VXF', name: 'Vanguard Extended Market ETF' },
      { ticker: 'IJH', name: 'iShares Core S&P Mid-Cap ETF' },
    ],
    assumptions: { expectedReturn: 0.075, volatility: 0.2 },
  },
  intl_developed: {
    id: 'intl_developed',
    name: 'International developed equity',
    shortName: 'Intl developed',
    bucket: 'equity',
    group: 'equity',
    description: 'Europe, Japan, Australia and other developed markets. Diversifies away from a single economy and currency.',
    examples: [
      { ticker: 'VEA', name: 'Vanguard FTSE Developed Markets ETF' },
      { ticker: 'IEFA', name: 'iShares Core MSCI EAFE ETF' },
    ],
    esgExamples: [{ ticker: 'ESGD', name: 'iShares ESG Aware MSCI EAFE ETF' }],
    assumptions: { expectedReturn: 0.07, volatility: 0.17 },
  },
  emerging: {
    id: 'emerging',
    name: 'Emerging-markets equity',
    shortName: 'Emerging mkts',
    bucket: 'equity',
    group: 'equity',
    description: 'Faster-growing but more volatile economies. Sized small and omitted for the most conservative profile.',
    examples: [
      { ticker: 'VWO', name: 'Vanguard FTSE Emerging Markets ETF' },
      { ticker: 'IEMG', name: 'iShares Core MSCI Emerging Markets ETF' },
    ],
    esgExamples: [{ ticker: 'ESGE', name: 'iShares ESG Aware MSCI EM ETF' }],
    assumptions: { expectedReturn: 0.075, volatility: 0.22 },
  },
  reit: {
    id: 'reit',
    name: 'Real estate (REITs)',
    shortName: 'REITs',
    bucket: 'alternatives',
    group: 'equity',
    description: 'Listed property companies. Income-oriented, partially inflation-linked, but equity-like in drawdowns.',
    examples: [
      { ticker: 'VNQ', name: 'Vanguard Real Estate ETF' },
      { ticker: 'SCHH', name: 'Schwab U.S. REIT ETF' },
    ],
    assumptions: { expectedReturn: 0.065, volatility: 0.19 },
  },
  gold: {
    id: 'gold',
    name: 'Gold',
    shortName: 'Gold',
    bucket: 'alternatives',
    group: 'gold',
    description: 'A small crisis and currency hedge with low correlation to stocks and bonds. No yield, so capped at 5%.',
    examples: [
      { ticker: 'IAU', name: 'iShares Gold Trust' },
      { ticker: 'GLDM', name: 'SPDR Gold MiniShares Trust' },
    ],
    assumptions: { expectedReturn: 0.04, volatility: 0.15 },
  },
};

export const BUCKET_LABELS: Record<Bucket, string> = {
  reserves: 'Reserves (set aside before investing)',
  cash: 'Cash buffer',
  fixed_income: 'Fixed income',
  equity: 'Equity',
  alternatives: 'Alternatives',
};

/** Display order for buckets, safest first. */
export const BUCKET_ORDER: Bucket[] = ['reserves', 'cash', 'fixed_income', 'equity', 'alternatives'];

export function examplesFor(id: AssetClassId, esg: boolean) {
  const ac = ASSET_CLASSES[id];
  return esg && ac.esgExamples ? ac.esgExamples : ac.examples;
}
