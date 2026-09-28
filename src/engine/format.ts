import { BUCKET_LABELS, BUCKET_ORDER } from './catalog';
import { RISK_PROFILES } from './profiles';
import type { AllocationPlan } from './types';
import { money, pct } from './util';

/** Plain-text rendering of a plan for the CLI and logs. */
export function formatPlanText(plan: AllocationPlan): string {
  const { input, summary } = plan;
  const out: string[] = [];
  const hr = '-'.repeat(96);

  out.push(`ALLOCATION PLAN  (${RISK_PROFILES[input.riskTolerance].label}, ${input.horizonYears}-year horizon${input.age ? `, age ${input.age}` : ''})`);
  out.push(hr);
  out.push(`Total amount      ${money(summary.totalAmount, true)}`);
  if (summary.reservesDollars > 0) {
    out.push(`Reserves          ${money(summary.reservesDollars, true)}`);
    out.push(`Invested          ${money(summary.investableDollars, true)}`);
  }
  if (summary.investableDollars > 0) {
    out.push(
      `Invested mix      equity ${pct(summary.equityWeight)}  |  fixed income ${pct(summary.fixedIncomeWeight)}  |  cash ${pct(summary.cashWeight)}` +
        (summary.alternativesWeight > 0 ? `  |  alternatives ${pct(summary.alternativesWeight)}` : ''),
    );
    out.push(`Equity ceiling    ${pct(summary.equityCap)} (${summary.equityCapReason})`);
  }
  out.push(
    `Rough outlook     ~${pct(summary.expectedReturn, 1)}/yr expected, ~${pct(summary.expectedVolatility, 1)} volatility, ` +
      `a bad year around ${pct(summary.typicalBadYear, 1)} (assumption-driven, not a forecast)`,
  );
  out.push('');

  const col = (s: string, w: number, right = false) => (right ? s.padStart(w) : s.padEnd(w));
  out.push(`${col('Asset class', 42)}${col('% total', 9, true)}${col('% invested', 12, true)}${col('Amount', 16, true)}  Examples`);
  out.push(hr);

  for (const bucket of BUCKET_ORDER) {
    const lines = plan.lines.filter((l) => l.bucket === bucket);
    if (lines.length === 0) continue;
    const b = plan.buckets.find((x) => x.bucket === bucket)!;
    out.push(`${BUCKET_LABELS[bucket]}  (${pct(b.weightOfTotal, 1)}, ${money(b.dollars)})`);
    for (const l of lines) {
      const examples = l.examples.map((e) => e.ticker).join(', ');
      out.push(
        `  ${col(l.name, 40)}${col(pct(l.weightOfTotal, 1), 9, true)}${col(l.weightOfInvested === null ? '-' : pct(l.weightOfInvested), 12, true)}${col(money(l.dollars, true), 16, true)}  ${examples}`,
      );
    }
  }
  out.push(hr);

  out.push(`Rebalancing: ${plan.rebalancing.description}`);
  if (plan.signals.applied.length > 0) {
    out.push('');
    out.push('Signals applied:');
    for (const s of plan.signals.applied) out.push(`  - ${s.id} [${s.dimension}]: ${s.effect}`);
  }
  if (plan.signals.ignored.length > 0) {
    out.push('Signals ignored:');
    for (const s of plan.signals.ignored) out.push(`  - ${s.id}: ${s.reason}`);
  }
  if (plan.notes.length > 0) {
    out.push('');
    out.push('Notes:');
    for (const n of plan.notes) out.push(`  - ${n}`);
  }
  if (plan.warnings.length > 0) {
    out.push('');
    out.push('Warnings:');
    for (const w of plan.warnings) out.push(`  ! ${w}`);
  }
  out.push('');
  out.push(plan.disclaimer);
  return out.join('\n');
}
