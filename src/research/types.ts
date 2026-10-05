/**
 * Research data model.
 *
 * Every number shown on the Research tab is an Indicator that has been through
 * validation (see validate.ts). A value that fails validation is never shown as a
 * number: the indicator is returned with status "rejected" and the reasons.
 */

export type ResearchGroup = 'rates' | 'inflation' | 'markets';

export type ResearchUnit = 'percent' | 'index';

/**
 * - verified:      passed every check AND agreed with an independent source for the same date
 * - single-source: passed every check, but no independent source exists or could be reached
 * - stale:         passed the checks except freshness; shown, but flagged as out of date
 * - rejected:      failed a check (bad parse, implausible, jumped, or disagreed with the cross-check); no value shown
 */
export type ResearchStatus = 'verified' | 'single-source' | 'stale' | 'rejected';

export interface Check {
  name: string;
  passed: boolean;
  detail: string;
}

export interface SourceRef {
  name: string;
  url: string;
}

export interface Observation {
  /** ISO date, YYYY-MM-DD. For monthly series this is the first day of the reference month. */
  date: string;
  value: number;
}

export interface Indicator {
  id: string;
  group: ResearchGroup;
  label: string;
  unit: ResearchUnit;
  /** Plain-English reason this matters to a long-term investor. */
  why: string;
  status: ResearchStatus;
  value: number | null;
  asOf: string | null;
  /** Change versus the prior observation, in the indicator's own unit (percentage points for percent). */
  change: number | null;
  /** Sparkline data, oldest first. Only present when the indicator was not rejected. */
  history: Observation[];
  checks: Check[];
  primary: SourceRef;
  /** The independent source that was compared against, when there was one. */
  crossCheck?: SourceRef & { value: number; asOf: string };
  /** For derived figures (spread, inflation rate): how it was computed. */
  method?: string;
}

export interface ResearchSnapshot {
  fetchedAt: string;
  indicators: Indicator[];
  /** Fetch-level problems (a source was unreachable). Indicators depending on it are downgraded, not dropped. */
  sourceErrors: { source: string; message: string }[];
}
