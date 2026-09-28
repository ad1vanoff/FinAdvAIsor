import { useEffect, useMemo, useState } from 'react';
import { RISK_PROFILES, money, pct } from '../engine';
import type { AllocationPlan, RiskAssessment, RiskTolerance } from '../engine';

export interface Narration {
  title: string;
  detail: string;
}

/** Turn the finished plan into the story of how it was built, with the real numbers. */
export function narrate(plan: AllocationPlan, assessment: RiskAssessment, riskTolerance: RiskTolerance, overridden: boolean): Narration[] {
  const s = plan.summary;
  const ef = plan.lines.find((l) => l.role === 'emergency_fund');
  const nt = plan.lines.find((l) => l.role === 'near_term');
  const reserves = [ef && `${money(ef.dollars)} as an emergency fund`, nt && `${money(nt.dollars)} for near-term needs`].filter(Boolean).join(' and ');
  const profile = RISK_PROFILES[riskTolerance];
  const applied = plan.signals.applied;
  const positions = plan.lines.filter((l) => l.role === 'portfolio').length;

  return [
    {
      title: 'Setting money aside first',
      detail: reserves ? `${reserves}, kept out of the market entirely.` : 'Your safety net is already covered, so the whole amount can be invested.',
    },
    {
      title: 'Reading your risk profile',
      detail: `${profile.label}${overridden ? ' (the profile you chose)' : `, from a score of ${assessment.score} of ${assessment.maxScore}`}. Starting point: ${pct(profile.baseEquity)} stocks.`,
    },
    {
      title: 'Applying the guardrails',
      detail: `Stocks capped at ${pct(s.equityCap)} by ${s.equityCapReason}. Caps only ever lower the stock share.`,
    },
    {
      title: 'Checking market signals',
      detail: applied.length > 0 ? `${applied.length} active: ${applied.map((a) => a.effect).join('; ')}.` : 'No signals active, so this is the strategic baseline.',
    },
    {
      title: 'Filling each sleeve',
      detail:
        s.investableDollars > 0
          ? `${positions} positions: ${pct(s.equityWeight)} stocks, ${pct(s.fixedIncomeWeight)} bonds, ${pct(s.cashWeight)} cash${s.alternativesWeight > 0 ? `, ${pct(s.alternativesWeight)} alternatives` : ''}.`
          : 'Nothing is left to invest after reserves, so for now the plan is all safety net.',
    },
    {
      title: 'Reconciling every dollar',
      detail: `${money(s.totalAmount, true)} allocated to the cent, with any position under 2% folded into its sleeve.`,
    },
  ];
}

export function BuildingStep({
  plan,
  assessment,
  riskTolerance,
  overridden,
  onDone,
}: {
  plan: AllocationPlan;
  assessment: RiskAssessment;
  riskTolerance: RiskTolerance;
  overridden: boolean;
  onDone: () => void;
}) {
  const items = useMemo(() => narrate(plan, assessment, riskTolerance, overridden), [plan, assessment, riskTolerance, overridden]);
  const [shown, setShown] = useState(0);
  const finished = shown >= items.length;

  useEffect(() => {
    const delay = finished ? 1100 : shown === 0 ? 400 : 650;
    const t = window.setTimeout(() => (finished ? onDone() : setShown((n) => n + 1)), delay);
    return () => window.clearTimeout(t);
  }, [shown, finished, items.length, onDone]);

  return (
    <div className="step building" aria-live="polite">
      <div className="step-head">
        <span className="eyebrow">Building your plan</span>
        <h2>{finished ? 'Your plan is ready' : 'Putting it together…'}</h2>
        <p className="secondary">This is what the planner is doing with your answers, step by step.</p>
      </div>
      <div className="build-progress" aria-hidden="true">
        <div className="fill" style={{ width: `${(shown / items.length) * 100}%` }} />
      </div>
      <ol className="build-list">
        {items.slice(0, shown).map((it, i) => (
          <li key={i} className="in">
            <span className="check" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M5 13l4 4L19 7" />
              </svg>
            </span>
            <div>
              <strong>{it.title}</strong>
              <div className="secondary small">{it.detail}</div>
            </div>
          </li>
        ))}
      </ol>
      <div className="step-nav">
        <span />
        <button type="button" className={`btn${finished ? ' primary' : ''}`} onClick={onDone}>
          {finished ? 'Show my plan' : 'Skip'}
        </button>
      </div>
    </div>
  );
}
