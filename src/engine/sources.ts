import type { AssetClassId } from './types';

/**
 * Where the rules of thumb come from. Every URL here was checked to resolve
 * (HTTP 200) when it was added. Only official, stable publishers are used:
 * regulators, the Treasury, and long-standing research pages.
 */
export interface Source {
  id: string;
  title: string;
  publisher: string;
  url: string;
}

export const SOURCES: Record<string, Source> = {
  sec_asset_allocation: {
    id: 'sec_asset_allocation',
    title: 'Asset Allocation',
    publisher: 'U.S. SEC, Investor.gov',
    url: 'https://www.investor.gov/introduction-investing/getting-started/asset-allocation',
  },
  sec_beginners_guide: {
    id: 'sec_beginners_guide',
    title: "Beginners' Guide to Asset Allocation, Diversification, and Rebalancing",
    publisher: 'U.S. SEC, Investor.gov',
    url: 'https://www.investor.gov/additional-resources/general-resources/publications-research/info-sheets/beginners-guide-asset',
  },
  sec_rebalancing: {
    id: 'sec_rebalancing',
    title: 'Rebalancing',
    publisher: 'U.S. SEC, Investor.gov glossary',
    url: 'https://www.investor.gov/introduction-investing/investing-basics/glossary/rebalancing',
  },
  sec_diversification: {
    id: 'sec_diversification',
    title: 'Diversification',
    publisher: 'U.S. SEC, Investor.gov glossary',
    url: 'https://www.investor.gov/introduction-investing/investing-basics/glossary/diversification',
  },
  sec_stocks: {
    id: 'sec_stocks',
    title: 'Stocks',
    publisher: 'U.S. SEC, Investor.gov',
    url: 'https://www.investor.gov/introduction-investing/investing-basics/investment-products/stocks',
  },
  sec_emerging: {
    id: 'sec_emerging',
    title: 'Emerging Markets',
    publisher: 'U.S. SEC, Investor.gov glossary',
    url: 'https://www.investor.gov/introduction-investing/investing-basics/glossary/emerging-markets',
  },
  sec_reits: {
    id: 'sec_reits',
    title: 'Real Estate Investment Trusts (REITs)',
    publisher: 'U.S. SEC, Investor.gov',
    url: 'https://www.investor.gov/introduction-investing/investing-basics/investment-products/real-estate-investment-trusts-reits',
  },
  sec_commodities: {
    id: 'sec_commodities',
    title: 'Commodities',
    publisher: 'U.S. SEC, Investor.gov',
    url: 'https://www.investor.gov/introduction-investing/investing-basics/investment-products/commodities',
  },
  finra_asset_allocation: {
    id: 'finra_asset_allocation',
    title: 'Asset Allocation and Diversification',
    publisher: 'FINRA',
    url: 'https://www.finra.org/investors/investing/investing-basics/asset-allocation-diversification',
  },
  finra_risk: {
    id: 'finra_risk',
    title: 'Risk: willingness and capacity to take it',
    publisher: 'FINRA',
    url: 'https://www.finra.org/investors/investing/investing-basics/risk',
  },
  finra_bonds: {
    id: 'finra_bonds',
    title: 'Bonds',
    publisher: 'FINRA',
    url: 'https://www.finra.org/investors/investing/investment-products/bonds',
  },
  finra_stocks: {
    id: 'finra_stocks',
    title: 'Stocks',
    publisher: 'FINRA',
    url: 'https://www.finra.org/investors/investing/investment-products/stocks',
  },
  cfpb_emergency: {
    id: 'cfpb_emergency',
    title: 'An essential guide to building an emergency fund',
    publisher: 'Consumer Financial Protection Bureau',
    url: 'https://www.consumerfinance.gov/an-essential-guide-to-building-an-emergency-fund/',
  },
  fdic_insurance: {
    id: 'fdic_insurance',
    title: 'Deposit Insurance',
    publisher: 'FDIC',
    url: 'https://www.fdic.gov/resources/deposit-insurance/',
  },
  treasury_tbills: {
    id: 'treasury_tbills',
    title: 'Treasury Bills',
    publisher: 'TreasuryDirect',
    url: 'https://www.treasurydirect.gov/marketable-securities/treasury-bills/',
  },
  treasury_tips: {
    id: 'treasury_tips',
    title: 'Treasury Inflation-Protected Securities (TIPS)',
    publisher: 'TreasuryDirect',
    url: 'https://www.treasurydirect.gov/marketable-securities/tips/',
  },
  vanguard_principles: {
    id: 'vanguard_principles',
    title: "Vanguard's Principles for Investing Success",
    publisher: 'Vanguard (PDF)',
    url: 'https://corporate.vanguard.com/content/dam/corp/research/pdf/Principles-for-investing-success.pdf',
  },
  vanguard_target: {
    id: 'vanguard_target',
    title: 'Target Retirement Funds and their glide path',
    publisher: 'Vanguard',
    url: 'https://investor.vanguard.com/investment-products/mutual-funds/target-retirement-funds',
  },
  jpm_ltcma: {
    id: 'jpm_ltcma',
    title: 'Long-Term Capital Market Assumptions',
    publisher: 'J.P. Morgan Asset Management',
    url: 'https://am.jpmorgan.com/us/en/asset-management/institutional/insights/portfolio-insights/ltcma/',
  },
  damodaran_returns: {
    id: 'damodaran_returns',
    title: 'Historical Returns on Stocks, Bonds and Bills: 1928 to present',
    publisher: 'Aswath Damodaran, NYU Stern',
    url: 'https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histretSP.html',
  },
  irs_roth: {
    id: 'irs_roth',
    title: 'Roth IRAs',
    publisher: 'IRS',
    url: 'https://www.irs.gov/retirement-plans/roth-iras',
  },
};

/** A rule the allocator applies, what it does here, and the reading behind it. */
export interface RuleReference {
  id: string;
  rule: string;
  howUsed: string;
  sourceIds: string[];
}

export const RULE_REFERENCES: RuleReference[] = [
  {
    id: 'emergency_fund',
    rule: 'An emergency fund comes before investing',
    howUsed: 'When no emergency fund exists, six months of expenses are set aside in insured cash and never invested.',
    sourceIds: ['cfpb_emergency', 'fdic_insurance'],
  },
  {
    id: 'near_term',
    rule: 'Money needed soon stays out of the market',
    howUsed: 'Anything needed within about two years is parked in Treasury bills so it cannot lose value when it is needed.',
    sourceIds: ['sec_asset_allocation', 'treasury_tbills'],
  },
  {
    id: 'risk_profile',
    rule: 'Willingness and capacity for risk set the starting stock share',
    howUsed: 'The questionnaire scores both; the four profiles start at 20%, 35%, 50% and 65% stocks. Behavioural answers cap the profile regardless of score.',
    sourceIds: ['finra_risk', 'sec_beginners_guide'],
  },
  {
    id: 'horizon_cap',
    rule: 'Time horizon caps the stock share',
    howUsed: 'Stocks are limited to 10% under two years, 25% under four, 40% under seven, 55% under twelve and 70% beyond, in the spirit of a target-date glide path.',
    sourceIds: ['vanguard_target', 'sec_asset_allocation'],
  },
  {
    id: 'age_cap',
    rule: 'Age as a ceiling: no more than 100 minus age in stocks',
    howUsed: 'A long-standing rule of thumb, used here only as a ceiling and never as a target, with a 15% floor so retirees keep some growth assets.',
    sourceIds: ['finra_asset_allocation', 'sec_beginners_guide'],
  },
  {
    id: 'diversification',
    rule: 'Each sleeve is spread across markets and maturities',
    howUsed: 'Stocks: U.S. total market, a small small/mid-cap slice, developed international and a small emerging-markets slice. Bonds: short Treasuries, core investment-grade and TIPS.',
    sourceIds: ['sec_diversification', 'vanguard_principles', 'finra_bonds', 'sec_emerging'],
  },
  {
    id: 'tips',
    rule: 'Inflation protection inside the bond sleeve',
    howUsed: 'A fifth of the bond sleeve is in TIPS by default, whose principal adjusts with CPI.',
    sourceIds: ['treasury_tips'],
  },
  {
    id: 'reit',
    rule: 'Real estate as a small, equity-like slice',
    howUsed: 'When switched on, a tenth of the stock sleeve moves into REITs.',
    sourceIds: ['sec_reits'],
  },
  {
    id: 'gold',
    rule: 'Gold as a small hedge, never a core holding',
    howUsed: 'When switched on, gold is capped at 5% because it produces no income.',
    sourceIds: ['sec_commodities'],
  },
  {
    id: 'rebalancing',
    rule: 'Rebalance by bands, not by calendar alone',
    howUsed: 'Review semi-annually and act when a sleeve drifts 5 points or a quarter of its target. New money goes to underweight sleeves first.',
    sourceIds: ['sec_rebalancing', 'sec_beginners_guide'],
  },
  {
    id: 'assumptions',
    rule: 'Return and volatility assumptions',
    howUsed: 'The rough outlook uses round, long-run figures in the spirit of published capital-market assumptions and long-run historical averages. They describe risk, not a forecast.',
    sourceIds: ['jpm_ltcma', 'damodaran_returns'],
  },
  {
    id: 'account',
    rule: 'Account type changes where things sit, not the mix',
    howUsed: 'Notes suggest holding bonds and REITs in tax-advantaged accounts and growth assets in Roth-style accounts.',
    sourceIds: ['irs_roth'],
  },
  {
    id: 'signals',
    rule: 'Market signals are bounded and asymmetric',
    howUsed: 'A design choice of this tool rather than an external rule: no signal moves the plan more than a few points, risk-on signals count half, and nothing breaches the stock ceiling.',
    sourceIds: [],
  },
];

/** Reading behind each asset class, shown next to its line in the plan. */
export const ASSET_CLASS_SOURCES: Record<AssetClassId, string[]> = {
  cash_hysa: ['fdic_insurance', 'cfpb_emergency'],
  tbills: ['treasury_tbills'],
  short_treasury: ['finra_bonds', 'treasury_tbills'],
  intermediate_bond: ['finra_bonds', 'sec_beginners_guide'],
  tips: ['treasury_tips'],
  ig_corporate: ['finra_bonds'],
  us_large: ['sec_stocks', 'vanguard_principles'],
  us_dividend: ['finra_stocks'],
  us_small_mid: ['finra_stocks', 'sec_diversification'],
  intl_developed: ['sec_diversification', 'vanguard_principles'],
  emerging: ['sec_emerging'],
  reit: ['sec_reits'],
  gold: ['sec_commodities'],
};

export function sourcesFor(ids: string[]): Source[] {
  return ids.map((id) => SOURCES[id]).filter((s): s is Source => Boolean(s));
}

export function ruleReference(id: string): RuleReference | undefined {
  return RULE_REFERENCES.find((r) => r.id === id);
}
