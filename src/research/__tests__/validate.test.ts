import { describe, expect, it } from 'vitest';
import { buildIndicators } from '../sources';
import type { RawFeeds } from '../sources';
import { parseBlsJson, parseCboeCsv, parseFredCsv, parseNyFedJson, parseTreasuryXml, spread, validateIndicator, yearOverYear } from '../validate';
import type { SeriesSpec } from '../validate';

const NOW = new Date('2026-10-05T12:00:00Z');
const SRC = { name: 'Primary', url: 'https://example.com' };
const X = { name: 'Independent', url: 'https://example.org' };

const spec: SeriesSpec = {
  id: 't',
  group: 'rates',
  label: 'Test',
  unit: 'percent',
  why: '',
  min: 0,
  max: 10,
  maxAgeDays: 7,
  maxStep: { abs: 1 },
  tolerance: 0.011,
  primary: SRC,
};
const obs = (...pairs: [string, number][]) => pairs.map(([date, value]) => ({ date, value }));

describe('parsers', () => {
  it('parses FRED CSV and skips blanks and "."', () => {
    const csv = 'observation_date,X\n2026-09-30,5.29\n2026-10-01,\n2026-10-02,.\n2026-10-03,abc\n2026-10-04,5.3';
    expect(parseFredCsv(csv)).toEqual(obs(['2026-09-30', 5.29], ['2026-10-04', 5.3]));
  });

  it('parses a Treasury XML field per entry', () => {
    const xml = `<feed><entry><d:NEW_DATE m:type="Edm.DateTime">2026-10-02T00:00:00</d:NEW_DATE><d:BC_10YEAR m:type="Edm.Double">5.28</d:BC_10YEAR></entry><entry><d:NEW_DATE m:type="Edm.DateTime">2026-10-01T00:00:00</d:NEW_DATE><d:BC_10YEAR m:type="Edm.Double">5.24</d:BC_10YEAR></entry></feed>`;
    expect(parseTreasuryXml(xml, 'BC_10YEAR')).toEqual(obs(['2026-10-01', 5.24], ['2026-10-02', 5.28]));
    expect(parseTreasuryXml(xml, 'BC_2YEAR')).toEqual([]);
  });

  it('parses BLS monthly data and ignores failed responses and annual averages', () => {
    const body = { status: 'REQUEST_SUCCEEDED', Results: { series: [{ data: [{ year: '2026', period: 'M08', value: '334.131' }, { year: '2026', period: 'M13', value: '1' }] }] } };
    expect(parseBlsJson(body)).toEqual(obs(['2026-08-01', 334.131]));
    expect(parseBlsJson({ status: 'REQUEST_NOT_PROCESSED' })).toEqual([]);
  });

  it('parses NY Fed and Cboe feeds', () => {
    expect(parseNyFedJson({ refRates: [{ effectiveDate: '2026-10-02', percentRate: 3.88 }, { effectiveDate: 'bad', percentRate: 1 }] })).toEqual(obs(['2026-10-02', 3.88]));
    expect(parseCboeCsv('DATE,OPEN,HIGH,LOW,CLOSE\n10/02/2026,16.15,16.24,15.30,15.31')).toEqual(obs(['2026-10-02', 15.31]));
  });
});

describe('derivations', () => {
  it('computes year-over-year only when the same month a year earlier exists', () => {
    const s = obs(['2025-08-01', 100], ['2025-10-01', 101], ['2026-08-01', 103], ['2026-10-01', 104]);
    const yoy = yearOverYear(s);
    expect(yoy.map((o) => o.date)).toEqual(['2026-08-01', '2026-10-01']);
    expect(yoy[0].value).toBeCloseTo(3);
    expect(yearOverYear(obs(['2026-09-01', 103], ['2025-08-01', 100]))).toEqual([]);
  });

  it('only pairs observations from the same date', () => {
    expect(spread(obs(['2026-10-01', 5.24], ['2026-10-02', 5.28]), obs(['2026-10-01', 4.78]))).toEqual([{ date: '2026-10-01', value: 5.24 - 4.78 }]);
  });
});

describe('validateIndicator', () => {
  const series = obs(['2026-09-30', 5.0], ['2026-10-01', 5.1]);

  it('is verified when every check passes and an independent source agrees on the same date', () => {
    const i = validateIndicator({ spec, series, cross: { source: X, series: obs(['2026-10-01', 5.1]) }, now: NOW });
    expect(i.status).toBe('verified');
    expect(i.value).toBe(5.1);
    expect(i.change).toBeCloseTo(0.1);
    expect(i.crossCheck?.value).toBe(5.1);
  });

  it('is single-source with no independent feed, and when the other source lacks that date', () => {
    expect(validateIndicator({ spec, series, cross: null, now: NOW }).status).toBe('single-source');
    expect(validateIndicator({ spec, series, cross: { source: X, series: obs(['2026-09-30', 5.0]) }, now: NOW }).status).toBe('single-source');
  });

  it('rejects, with no value, when sources disagree', () => {
    const i = validateIndicator({ spec, series, cross: { source: X, series: obs(['2026-10-01', 5.4]) }, now: NOW });
    expect(i.status).toBe('rejected');
    expect(i.value).toBeNull();
    expect(i.history).toEqual([]);
    expect(i.checks.find((c) => c.name === 'cross-check')?.passed).toBe(false);
  });

  it('rejects out-of-range values and implausible jumps', () => {
    expect(validateIndicator({ spec, series: obs(['2026-10-01', 55]), cross: null, now: NOW }).status).toBe('rejected');
    expect(validateIndicator({ spec, series: obs(['2026-09-30', 2], ['2026-10-01', 5]), cross: null, now: NOW }).status).toBe('rejected');
  });

  it('rejects future-dated readings', () => {
    expect(validateIndicator({ spec, series: obs(['2026-12-01', 5]), cross: null, now: NOW }).status).toBe('rejected');
  });

  it('flags old data as stale but still shows it', () => {
    const i = validateIndicator({ spec, series: obs(['2026-09-01', 5]), cross: null, now: NOW });
    expect(i.status).toBe('stale');
    expect(i.value).toBe(5);
  });

  it('rejects empty responses and fetch failures', () => {
    expect(validateIndicator({ spec, series: [], cross: null, now: NOW }).status).toBe('rejected');
    expect(validateIndicator({ spec, series, cross: null, fetchError: 'HTTP 500', now: NOW }).status).toBe('rejected');
  });
});

describe('buildIndicators', () => {
  const raw = (over: Partial<RawFeeds> = {}): RawFeeds => ({
    fred: {
      DGS3MO: obs(['2026-10-01', 4.17]),
      DGS2: obs(['2026-09-30', 4.88], ['2026-10-01', 4.78]),
      DGS10: obs(['2026-09-30', 5.29], ['2026-10-01', 5.24]),
      DFII10: obs(['2026-10-01', 2.88]),
      DFF: obs(['2026-10-01', 3.88]),
      CPIAUCSL: obs(['2025-08-01', 323.291], ['2026-08-01', 334.131]),
      UNRATE: obs(['2026-08-01', 4.1], ['2026-09-01', 4.2]),
      SP500: obs(['2026-10-01', 7666.45], ['2026-10-02', 7722.72]),
      VIXCLS: obs(['2026-10-01', 16.39], ['2026-10-02', 15.31]),
      BAMLH0A0HYM2: obs(['2026-09-30', 3.12], ['2026-10-01', 3.24]),
    },
    treasuryNominal: { BC_3MONTH: obs(['2026-10-01', 4.17]), BC_2YEAR: obs(['2026-09-30', 4.88], ['2026-10-01', 4.78]), BC_10YEAR: obs(['2026-09-30', 5.29], ['2026-10-01', 5.24]) },
    treasuryReal: { TC_10YEAR: obs(['2026-10-01', 2.88]) },
    nyfed: obs(['2026-10-01', 3.88]),
    blsCpi: obs(['2025-08-01', 323.291], ['2026-08-01', 334.131]),
    blsUnemployment: obs(['2026-08-01', 4.1], ['2026-09-01', 4.2]),
    cboeVix: obs(['2026-10-01', 16.39], ['2026-10-02', 15.31]),
    errors: {},
    ...over,
  });
  const byId = (r: RawFeeds) => Object.fromEntries(buildIndicators(r, NOW).map((i) => [i.id, i]));

  it('verifies figures that agree across sources and derives the spread and inflation rate', () => {
    const i = byId(raw());
    expect(i['ust-10y'].status).toBe('verified');
    expect(i['curve-2s10s'].value).toBeCloseTo(0.46);
    expect(i['curve-2s10s'].status).toBe('verified');
    expect(i['cpi-yoy'].value).toBeCloseTo(3.35, 1);
    expect(i['cpi-yoy'].status).toBe('verified');
    expect(i['sp500'].status).toBe('single-source');
  });

  it('downgrades to single-source (not rejected) when an independent source is unreachable', () => {
    const i = byId(raw({ treasuryNominal: {}, errors: { 'treasury-nominal': 'HTTP 503' } }));
    expect(i['ust-10y'].status).toBe('single-source');
    expect(i['ust-10y'].checks.at(-1)?.detail).toContain('unreachable');
  });

  it('rejects when the primary source failed, and when a source disagrees', () => {
    expect(byId(raw({ errors: { 'fred:DGS10': 'timed out' } }))['ust-10y'].status).toBe('rejected');
    expect(byId(raw({ treasuryNominal: { BC_10YEAR: obs(['2026-09-30', 5.29], ['2026-10-01', 5.5]) } }))['ust-10y'].status).toBe('rejected');
  });
});
