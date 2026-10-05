import { RISK_QUESTIONS, money } from '../engine';
import type { AllocationPlan, RiskAssessment, RiskTolerance } from '../engine';
import type { AssistantContext } from '../assistant/prompt';
import { parseMoney } from './state';
import type { WizardState } from './state';

/** Everything the assistant needs to talk about this user's situation, built from the wizard state. */
export function buildAssistantContext(state: WizardState, plan: AllocationPlan | null, assessment: RiskAssessment | null, riskTolerance: RiskTolerance): AssistantContext {
  const answers: Record<string, string> = {};
  const amount = parseMoney(state.basics.amount);
  if (amount !== undefined && !Number.isNaN(amount) && amount > 0) answers['Amount to allocate'] = money(amount);
  answers['Years until the money is needed'] = `${state.basics.horizonYears}`;
  if (state.basics.age.trim()) answers['Age'] = state.basics.age.trim();

  const sf = state.safety;
  if (sf.hasEmergencyFund !== null) answers['Already has an emergency fund'] = sf.hasEmergencyFund ? 'yes' : 'no';
  const expenses = parseMoney(sf.monthlyExpenses);
  if (sf.hasEmergencyFund === false && expenses && !Number.isNaN(expenses)) answers['Monthly expenses'] = money(expenses);
  const near = parseMoney(sf.nearTermNeed);
  if (sf.hasNearTerm === true && near && !Number.isNaN(near)) answers['Needed within two years'] = money(near);
  else if (sf.hasNearTerm === false) answers['Needed within two years'] = 'nothing';

  for (const q of RISK_QUESTIONS) {
    const i = state.answers[q.id];
    if (i !== undefined && q.options[i]) answers[q.prompt] = q.options[i].label;
  }

  const p = state.prefs;
  const yes = (v: boolean) => (v ? 'yes' : 'no');
  answers['Income focus'] = yes(p.needsIncome);
  answers['Inflation-protected bonds (TIPS)'] = yes(p.inflationProtection);
  answers['International stocks'] = yes(p.includeInternational);
  answers['Real estate (REITs)'] = yes(p.includeRealEstate);
  answers['Gold'] = yes(p.includeGold);
  answers['Account type'] = p.accountType;

  return {
    stage: state.step,
    answers,
    assessment: assessment
      ? { score: assessment.score, maxScore: assessment.maxScore, scoredProfile: assessment.scoredProfile, riskTolerance: assessment.riskTolerance, reasons: assessment.reasons }
      : undefined,
    riskTolerance: assessment ? riskTolerance : undefined,
    plan: plan ?? undefined,
  };
}
