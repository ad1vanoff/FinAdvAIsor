import type { Check, Indicator, Observation, ResearchGroup, ResearchStatus, ResearchUnit, SourceRef } from './types';

/**
 * Pure validation rules. Nothing here touches the network, so every rule is unit-tested.
 *
 * A value is only called "verified" when it (1) parses, (2) sits inside a plausible range,
 * (3) is fresh for its publishing frequency, (4) did not jump implausibly from the prior
 * reading, and (5) matches an independent source for the SAME date within rounding.
 */

export interface SeriesSpec {
  id: string;
  group: ResearchGroup;
  label: string;
  unit: ResearchUnit;
  why: string;
  /** Plausible bounds for the value (after any derivation). Outside this is treated as a data error. */
  min: number;
  max: number;
  /** Maximum calendar-day age before the reading is flagged stale. */
  maxAgeDays: number;
  /** Largest believable move since the previous observation. */
  maxStep: { abs?: number; rel?: number };
  /** Allowed disagreement with the cross-check source, in the series' own unit. */
  tolerance: number;
  primary: SourceRef;
  method?: string;
}

const DAY = 86_400_000;

export function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

export function ageDays(date: string, now: Date): number {
  return Math.floor((now.getTime() - Date.parse(`${date}T00:00:00Z`)) / DAY);
}

/** FRED CSV: header row, then `date,value` with an empty or "." value for missing observations. */
export function parseFredCsv(csv: string): Observation[] {
  const out: Observation[] = [];
  const lines = csv.split(/\r?\n/).filter(Boolean);
  for (const line of lines.slice(1)) {
    const [date, raw] = line.split(',');
    if (!date || !isIsoDate(date)) continue;
    if (raw === undefined || raw === '' || raw === '.') continue;
    const value = Number(raw);
    if (Number.isFinite(value)) out.push({ date, value });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Treasury XML feed: pull one numeric field (e.g. BC_10YEAR) per entry, keyed by NEW_DATE. */
export function parseTreasuryXml(xml: string, field: string): Observation[] {
  const out: Observation[] = [];
  for (const entry of xml.split('<entry>').slice(1)) {
    const date = /<d:NEW_DATE[^>]*>(\d{4}-\d{2}-\d{2})/.exec(entry)?.[1];
    const raw = new RegExp(`<d:${field}[^>]*>([-\\d.]+)</d:${field}>`).exec(entry)?.[1];
    if (!date || raw === undefined) continue;
    const value = Number(raw);
    if (Number.isFinite(value)) out.push({ date, value });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** BLS v1 API JSON. Monthly periods are "M01".."M12"; "M13" (annual average) is skipped. */
export function parseBlsJson(body: unknown): Observation[] {
  const out: Observation[] = [];
  const b = body as { status?: string; Results?: { series?: { data?: { year: string; period: string; value: string }[] }[] } };
  if (b?.status !== 'REQUEST_SUCCEEDED') return out;
  for (const d of b.Results?.series?.[0]?.data ?? []) {
    const m = /^M(0[1-9]|1[0-2])$/.exec(d.period);
    const value = Number(d.value);
    if (!m || !Number.isFinite(value) || !/^\d{4}$/.test(d.year)) continue;
    out.push({ date: `${d.year}-${m[1]}-01`, value });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** NY Fed reference-rate JSON (EFFR etc.): `refRates[].effectiveDate` and `percentRate`. */
export function parseNyFedJson(body: unknown): Observation[] {
  const out: Observation[] = [];
  for (const r of (body as { refRates?: { effectiveDate?: string; percentRate?: number }[] })?.refRates ?? []) {
    if (r.effectiveDate && isIsoDate(r.effectiveDate) && typeof r.percentRate === 'number' && Number.isFinite(r.percentRate)) out.push({ date: r.effectiveDate, value: r.percentRate });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Cboe index history CSV: `MM/DD/YYYY,open,high,low,close`. Returns closes. */
export function parseCboeCsv(csv: string): Observation[] {
  const out: Observation[] = [];
  for (const line of csv.split(/\r?\n/)) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4}),/.exec(line);
    if (!m) continue;
    const value = Number(line.split(',')[4]);
    if (Number.isFinite(value)) out.push({ date: `${m[3]}-${m[1]}-${m[2]}`, value });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Year-over-year % change. Requires the observation exactly 12 months earlier;
 * a gap (e.g. a missing month) yields no figure rather than a wrong one.
 */
export function yearOverYear(series: Observation[]): Observation[] {
  const byDate = new Map(series.map((o) => [o.date, o.value]));
  const out: Observation[] = [];
  for (const o of series) {
    const prior = byDate.get(`${Number(o.date.slice(0, 4)) - 1}${o.date.slice(4)}`);
    if (prior !== undefined && prior > 0) out.push({ date: o.date, value: (o.value / prior - 1) * 100 });
  }
  return out;
}

/** Pair two series by date (inner join). Used for derived figures such as the 10Y minus 2Y spread. */
export function spread(a: Observation[], b: Observation[]): Observation[] {
  const bm = new Map(b.map((o) => [o.date, o.value]));
  const out: Observation[] = [];
  for (const o of a) {
    const other = bm.get(o.date);
    if (other !== undefined) out.push({ date: o.date, value: o.value - other });
  }
  return out;
}

const fmt = (n: number) => (Math.round(n * 1000) / 1000).toString();

export interface ValidateOptions {
  spec: SeriesSpec;
  series: Observation[];
  /** Independent readings of the same quantity, or null when unavailable. */
  cross: { source: SourceRef; series: Observation[] } | null;
  /** Set when the primary source itself could not be fetched. */
  fetchError?: string;
  now: Date;
}

export function validateIndicator({ spec, series, cross, fetchError, now }: ValidateOptions): Indicator {
  const base = { id: spec.id, group: spec.group, label: spec.label, unit: spec.unit, why: spec.why, primary: spec.primary, method: spec.method };
  const reject = (checks: Check[]): Indicator => ({ ...base, status: 'rejected', value: null, asOf: null, change: null, history: [], checks });

  if (fetchError) return reject([{ name: 'fetch', passed: false, detail: fetchError }]);
  if (series.length === 0) return reject([{ name: 'parse', passed: false, detail: 'no usable observations in the response' }]);

  const latest = series[series.length - 1];
  const prev = series.length > 1 ? series[series.length - 2] : null;
  const checks: Check[] = [{ name: 'parse', passed: true, detail: `${series.length} observations parsed` }];

  const inRange = latest.value >= spec.min && latest.value <= spec.max;
  checks.push({ name: 'range', passed: inRange, detail: `${fmt(latest.value)} ${inRange ? 'is within' : 'is outside'} the plausible range ${spec.min} to ${spec.max}` });

  const notFuture = ageDays(latest.date, now) >= -1;
  checks.push({ name: 'date', passed: notFuture, detail: notFuture ? `dated ${latest.date}` : `dated ${latest.date}, which is in the future` });

  let stepOk = true;
  if (prev) {
    const move = latest.value - prev.value;
    const { abs, rel } = spec.maxStep;
    const absOk = abs === undefined || Math.abs(move) <= abs;
    const relOk = rel === undefined || prev.value === 0 || Math.abs(move / prev.value) <= rel;
    stepOk = absOk && relOk;
    checks.push({ name: 'continuity', passed: stepOk, detail: `moved ${fmt(move)} since ${prev.date}${stepOk ? ', within the believable step' : ', more than a believable one-period move'}` });
  }

  const age = ageDays(latest.date, now);
  const fresh = age <= spec.maxAgeDays;
  checks.push({ name: 'freshness', passed: fresh, detail: `${age} day${age === 1 ? '' : 's'} old (limit ${spec.maxAgeDays})` });

  let crossRef: Indicator['crossCheck'];
  let crossOk = true;
  if (cross) {
    const match = cross.series.find((o) => o.date === latest.date);
    if (match) {
      const diff = Math.abs(match.value - latest.value);
      crossOk = diff <= spec.tolerance;
      crossRef = { ...cross.source, value: match.value, asOf: match.date };
      checks.push({ name: 'cross-check', passed: crossOk, detail: `${cross.source.name} reports ${fmt(match.value)} for ${match.date} (difference ${fmt(diff)}, tolerance ${spec.tolerance})` });
    } else {
      const lastCross = cross.series[cross.series.length - 1];
      checks.push({ name: 'cross-check', passed: true, detail: `${cross.source.name} has no reading for ${latest.date} yet${lastCross ? ` (its latest is ${lastCross.date})` : ''}; not compared` });
    }
  } else {
    checks.push({ name: 'cross-check', passed: true, detail: 'no independent source available; not compared' });
  }

  const hardFail = !inRange || !notFuture || !stepOk || !crossOk;
  if (hardFail) return reject(checks);

  const status: ResearchStatus = !fresh ? 'stale' : crossRef ? 'verified' : 'single-source';
  return {
    ...base,
    status,
    value: latest.value,
    asOf: latest.date,
    change: prev ? latest.value - prev.value : null,
    history: series.slice(-60),
    checks,
    crossCheck: crossRef,
  };
}
