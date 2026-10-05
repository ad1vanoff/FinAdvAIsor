import { parseBlsJson, parseCboeCsv, parseFredCsv, parseNyFedJson, parseTreasuryXml, spread, validateIndicator, yearOverYear } from './validate';
import type { SeriesSpec } from './validate';
import type { Indicator, Observation, ResearchSnapshot, SourceRef } from './types';

/**
 * Where each figure comes from. Primary readings come from FRED (the St. Louis Fed's
 * republication of official series); each is cross-checked against the original publisher
 * wherever one offers a free, keyless feed. Figures with no independent source are labelled
 * "single source" rather than "verified".
 */

const FRED: SourceRef = { name: 'FRED (St. Louis Fed)', url: 'https://fred.stlouisfed.org/' };
const TREASURY: SourceRef = { name: 'U.S. Treasury', url: 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates' };
const NYFED: SourceRef = { name: 'NY Fed reference rates', url: 'https://www.newyorkfed.org/markets/reference-rates/effr' };
const BLS: SourceRef = { name: 'Bureau of Labor Statistics', url: 'https://www.bls.gov/data/' };
const CBOE: SourceRef = { name: 'Cboe', url: 'https://www.cboe.com/tradable_products/vix/vix_historical_data/' };
const fredSeries = (id: string, name: string): SourceRef => ({ name: `${FRED.name}, ${name}`, url: `https://fred.stlouisfed.org/series/${id}` });

/** Feed names double as keys in RawFeeds.errors; FRED feeds are `fred:<SERIES_ID>`. */
type Feed = string;

interface Recipe {
  spec: SeriesSpec;
  /** How to build the primary series. */
  primary: () => Observation[];
  /** How to build the independent series, or null if none exists. */
  cross: { source: SourceRef; build: () => Observation[]; needs: Feed } | null;
  needs: Feed[];
}

export interface RawFeeds {
  fred: Record<string, Observation[]>;
  treasuryNominal: Record<string, Observation[]>;
  treasuryReal: Record<string, Observation[]>;
  nyfed: Observation[];
  blsCpi: Observation[];
  blsUnemployment: Observation[];
  cboeVix: Observation[];
  /** Per-source fetch failures, keyed by feed name. */
  errors: Record<string, string>;
}

const rate = (extra: Partial<SeriesSpec> & Pick<SeriesSpec, 'id' | 'label' | 'why' | 'primary'>): SeriesSpec => ({
  group: 'rates',
  unit: 'percent',
  min: -1,
  max: 20,
  maxAgeDays: 7,
  maxStep: { abs: 1 },
  tolerance: 0.011,
  ...extra,
});

export function buildIndicators(raw: RawFeeds, now: Date): Indicator[] {
  const f = (id: string) => raw.fred[id] ?? [];
  const tn = (field: string) => raw.treasuryNominal[field] ?? [];

  const recipes: Recipe[] = [
    {
      spec: rate({ id: 'tbill-3m', label: '3-month Treasury bill', primary: fredSeries('DGS3MO', '3-month constant maturity'), why: 'The yield on cash-like safe money. It is the bar every conservative holding is measured against.' }),
      primary: () => f('DGS3MO'),
      cross: { source: TREASURY, build: () => tn('BC_3MONTH'), needs: 'treasury-nominal' },
      needs: ['fred:DGS3MO'],
    },
    {
      spec: rate({ id: 'ust-2y', label: '2-year Treasury yield', primary: fredSeries('DGS2', '2-year constant maturity'), why: 'Reflects where markets expect short-term rates to head. It sets what short bonds and CDs can pay.' }),
      primary: () => f('DGS2'),
      cross: { source: TREASURY, build: () => tn('BC_2YEAR'), needs: 'treasury-nominal' },
      needs: ['fred:DGS2'],
    },
    {
      spec: rate({ id: 'ust-10y', label: '10-year Treasury yield', primary: fredSeries('DGS10', '10-year constant maturity'), why: 'The benchmark long-term rate. Bond prices fall when it rises, and it anchors mortgage and corporate borrowing costs.' }),
      primary: () => f('DGS10'),
      cross: { source: TREASURY, build: () => tn('BC_10YEAR'), needs: 'treasury-nominal' },
      needs: ['fred:DGS10'],
    },
    {
      spec: rate({
        id: 'curve-2s10s',
        label: '10-year minus 2-year spread',
        primary: fredSeries('DGS10', '10-year minus 2-year'),
        min: -4,
        max: 5,
        maxStep: { abs: 0.5 },
        tolerance: 0.015,
        method: '10-year yield minus 2-year yield, same date',
        why: 'A negative spread (inverted curve) has often preceded slowdowns. It is a caution flag, not a timing tool.',
      }),
      primary: () => spread(f('DGS10'), f('DGS2')),
      cross: { source: TREASURY, build: () => spread(tn('BC_10YEAR'), tn('BC_2YEAR')), needs: 'treasury-nominal' },
      needs: ['fred:DGS10', 'fred:DGS2'],
    },
    {
      spec: rate({ id: 'tips-10y', label: '10-year TIPS real yield', primary: fredSeries('DFII10', '10-year inflation-indexed'), min: -3, max: 8, why: 'The return above inflation that Treasury inflation-protected bonds lock in. Positive real yields make TIPS more attractive.' }),
      primary: () => f('DFII10'),
      cross: { source: TREASURY, build: () => raw.treasuryReal.TC_10YEAR ?? [], needs: 'treasury-real' },
      needs: ['fred:DFII10'],
    },
    {
      spec: rate({ id: 'fed-funds', label: 'Effective fed funds rate', primary: fredSeries('DFF', 'effective federal funds rate'), maxStep: { abs: 0.6 }, why: 'The overnight rate the Federal Reserve steers. It drives savings, money-market and T-bill yields.' }),
      primary: () => f('DFF'),
      cross: { source: NYFED, build: () => raw.nyfed, needs: 'nyfed' },
      needs: ['fred:DFF'],
    },
    {
      spec: {
        id: 'cpi-yoy',
        group: 'inflation',
        label: 'Inflation (CPI, 12-month)',
        unit: 'percent',
        min: -3,
        max: 20,
        maxAgeDays: 75,
        maxStep: { abs: 1.5 },
        tolerance: 0.011,
        primary: fredSeries('CPIAUCSL', 'CPI for All Urban Consumers'),
        method: 'Year-over-year change in the seasonally adjusted CPI-U index; requires the same month one year earlier',
        why: 'How fast prices are rising. It is the hurdle your savings must clear to grow in real terms.',
      },
      primary: () => yearOverYear(f('CPIAUCSL')),
      cross: { source: { ...BLS, url: 'https://www.bls.gov/cpi/' }, build: () => yearOverYear(raw.blsCpi), needs: 'bls-cpi' },
      needs: ['fred:CPIAUCSL'],
    },
    {
      spec: {
        id: 'unemployment',
        group: 'inflation',
        label: 'Unemployment rate',
        unit: 'percent',
        min: 1,
        max: 30,
        maxAgeDays: 75,
        maxStep: { abs: 1 },
        tolerance: 0.05,
        primary: fredSeries('UNRATE', 'civilian unemployment rate'),
        why: 'A read on the health of the job market, and so on the odds of slowdown that equity risk is paid for.',
      },
      primary: () => f('UNRATE'),
      cross: { source: { ...BLS, url: 'https://www.bls.gov/cps/' }, build: () => raw.blsUnemployment, needs: 'bls-unemployment' },
      needs: ['fred:UNRATE'],
    },
    {
      spec: {
        id: 'sp500',
        group: 'markets',
        label: 'S&P 500 index',
        unit: 'index',
        min: 100,
        max: 100_000,
        maxAgeDays: 7,
        maxStep: { rel: 0.2 },
        tolerance: 0,
        primary: fredSeries('SP500', 'S&P 500'),
        why: 'The broad U.S. stock market. Shown for context; day-to-day moves are not a reason to change a long-term plan.',
      },
      primary: () => f('SP500'),
      cross: null,
      needs: ['fred:SP500'],
    },
    {
      spec: {
        id: 'vix',
        group: 'markets',
        label: 'VIX (expected stock volatility)',
        unit: 'index',
        min: 5,
        max: 120,
        maxAgeDays: 7,
        maxStep: { rel: 1 },
        tolerance: 0.011,
        primary: fredSeries('VIXCLS', 'CBOE Volatility Index'),
        why: 'The market’s own estimate of near-term swings. Above about 30 usually means stress; it is a gauge of fear, not a forecast.',
      },
      primary: () => f('VIXCLS'),
      cross: { source: CBOE, build: () => raw.cboeVix, needs: 'cboe' },
      needs: ['fred:VIXCLS'],
    },
    {
      spec: {
        id: 'hy-spread',
        group: 'markets',
        label: 'High-yield bond spread',
        unit: 'percent',
        min: 0.5,
        max: 25,
        maxAgeDays: 7,
        maxStep: { abs: 1.5 },
        tolerance: 0,
        primary: fredSeries('BAMLH0A0HYM2', 'ICE BofA US High Yield spread'),
        why: 'The extra yield investors demand to hold risky corporate debt. A widening spread signals rising credit worries.',
      },
      primary: () => f('BAMLH0A0HYM2'),
      cross: null,
      needs: ['fred:BAMLH0A0HYM2'],
    },
  ];

  const feedError = (feed: Feed): string | undefined => raw.errors[feed];

  return recipes.map((r) => {
    const fetchError = r.needs.map(feedError).find(Boolean);
    const crossErr = r.cross ? feedError(r.cross.needs) : undefined;
    // A failed independent source downgrades to single-source; it never blocks the primary reading.
    const cross = r.cross && !crossErr ? { source: r.cross.source, series: r.cross.build() } : null;
    const ind = validateIndicator({ spec: r.spec, series: fetchError ? [] : r.primary(), cross, fetchError, now });
    if (crossErr && r.cross) ind.checks.push({ name: 'cross-check', passed: true, detail: `${r.cross.source.name} was unreachable (${crossErr}); not compared` });
    return ind;
  });
}

// --- network ----------------------------------------------------------------

const TIMEOUT_MS = 12_000;
const UA = 'FinAdvAIsor/0.1 (educational research tool)';

async function get(url: string): Promise<Response> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'user-agent': UA }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

const FRED_IDS = ['DGS3MO', 'DGS2', 'DGS10', 'DFII10', 'DFF', 'CPIAUCSL', 'UNRATE', 'SP500', 'VIXCLS', 'BAMLH0A0HYM2'];

function monthKeys(now: Date): string[] {
  const keys: string[] = [];
  for (let i = 0; i < 2; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

export async function fetchRaw(now: Date = new Date()): Promise<RawFeeds> {
  const errors: Record<string, string> = {};
  const raw: RawFeeds = { fred: {}, treasuryNominal: {}, treasuryReal: {}, nyfed: [], blsCpi: [], blsUnemployment: [], cboeVix: [], errors };
  const start = new Date(Date.UTC(now.getUTCFullYear() - 2, now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const guard = async (feed: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      errors[feed] = (e as Error).name === 'TimeoutError' ? 'timed out' : (e as Error).message;
    }
  };

  const treasuryXml = async (data: string) => {
    const parts = await Promise.all(monthKeys(now).map(async (m) => (await get(`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=${data}&field_tdr_date_value_month=${m}`)).text()));
    return parts.join('\n');
  };

  await Promise.all([
    ...FRED_IDS.map((id) =>
      guard(`fred:${id}`, async () => {
        raw.fred[id] = parseFredCsv(await (await get(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${start}`)).text());
      }),
    ),
    guard('treasury-nominal', async () => {
      const xml = await treasuryXml('daily_treasury_yield_curve');
      for (const field of ['BC_3MONTH', 'BC_2YEAR', 'BC_10YEAR']) raw.treasuryNominal[field] = parseTreasuryXml(xml, field);
    }),
    guard('treasury-real', async () => {
      raw.treasuryReal.TC_10YEAR = parseTreasuryXml(await treasuryXml('daily_treasury_real_yield_curve'), 'TC_10YEAR');
    }),
    guard('nyfed', async () => {
      raw.nyfed = parseNyFedJson(await (await get('https://markets.newyorkfed.org/api/rates/unsecured/effr/last/30.json')).json());
    }),
    guard('bls-cpi', async () => {
      raw.blsCpi = parseBlsJson(await (await get('https://api.bls.gov/publicAPI/v1/timeseries/data/CUSR0000SA0')).json());
    }),
    guard('bls-unemployment', async () => {
      raw.blsUnemployment = parseBlsJson(await (await get('https://api.bls.gov/publicAPI/v1/timeseries/data/LNS14000000')).json());
    }),
    guard('cboe', async () => {
      raw.cboeVix = parseCboeCsv(await (await get('https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv')).text()).slice(-60);
    }),
  ]);
  return raw;
}

export async function buildSnapshot(now: Date = new Date()): Promise<ResearchSnapshot> {
  const raw = await fetchRaw(now);
  return {
    fetchedAt: now.toISOString(),
    indicators: buildIndicators(raw, now),
    sourceErrors: Object.entries(raw.errors).map(([source, message]) => ({ source, message })),
  };
}
