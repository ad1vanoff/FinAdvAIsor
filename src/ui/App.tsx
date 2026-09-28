import { useEffect, useMemo, useRef } from 'react';
import { useState } from 'react';
import { RISK_QUESTIONS, allocate, assessRisk, isComplete } from '../engine';
import type { AllocationPlan, RiskTolerance } from '../engine';
import { BuildingStep } from './Building';
import { Progress } from './controls';
import { Results } from './Results';
import { INITIAL, STEPS, loadState, saveState, stepIndex, toAllocationInput } from './state';
import type { StepId, WizardState } from './state';
import { BasicsStep, PreferencesStep, ProfileReveal, RiskStep, SafetyStep } from './steps';

const LAST_QUESTION = RISK_QUESTIONS.length - 1;
/** riskIndex value that shows the scored result instead of a question. */
const REVEAL = RISK_QUESTIONS.length;

export function App() {
  const [state, setState] = useState<WizardState>(loadState);
  const advanceTimer = useRef<number | undefined>(undefined);

  useEffect(() => saveState(state), [state]);
  useEffect(() => () => window.clearTimeout(advanceTimer.current), []);

  const patch = (p: Partial<WizardState>) => setState((s) => ({ ...s, ...p }));
  const go = (step: StepId) => setState((s) => ({ ...s, step, reached: Math.max(s.reached, stepIndex(step)) }));

  /** Idempotent: advancing twice from the same question is a no-op the second time. */
  const advanceRisk = (from: number) =>
    setState((s) => {
      if (s.step !== 'risk' || s.riskIndex !== from) return s;
      return { ...s, riskIndex: from < LAST_QUESTION ? from + 1 : REVEAL };
    });

  const answer = (index: number, option: number) => {
    setState((s) => ({ ...s, answers: { ...s.answers, [RISK_QUESTIONS[index].id]: option } }));
    window.clearTimeout(advanceTimer.current);
    advanceTimer.current = window.setTimeout(() => advanceRisk(index), 260);
  };

  const assessment = useMemo(() => (isComplete(state.answers) ? assessRisk(state.answers) : null), [state.answers]);
  const riskTolerance: RiskTolerance = state.overrideRisk ?? assessment?.riskTolerance ?? 'conservative';
  const overridden = state.overrideRisk !== null && state.overrideRisk !== assessment?.riskTolerance;

  const result = useMemo<{ plan?: AllocationPlan; error?: string } | null>(() => {
    if ((state.step !== 'plan' && state.step !== 'building') || !assessment) return null;
    try {
      return { plan: allocate(toAllocationInput(state, riskTolerance)) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [state, assessment, riskTolerance]);

  // Guard against stale storage: the plan needs a finished questionnaire.
  useEffect(() => {
    if ((state.step === 'plan' || state.step === 'building') && !assessment) patch({ step: 'risk', riskIndex: 0 });
  }, [state.step, assessment]);

  // If the reveal is requested but a question was un-answered (e.g. edited storage), show the first open one.
  const firstUnanswered = RISK_QUESTIONS.findIndex((q) => state.answers[q.id] === undefined);
  const riskIndex = state.riskIndex === REVEAL && !assessment ? Math.max(0, firstUnanswered) : state.riskIndex;

  const wide = state.step === 'plan';
  const progressStep = state.step === 'building' ? 'plan' : state.step;

  return (
    <div className={`app${wide ? ' wide' : ''}`}>
      <header className="topbar">
        <div>
          <h1>FinAdvAIsor</h1>
          <p className="tagline">A conservative planner's allocation, built from a few questions.</p>
        </div>
        <span className="small muted">Educational tool, not personalised advice</span>
      </header>

      <Progress steps={STEPS} current={progressStep} reached={state.reached} onJump={(id) => go(id as StepId)} />

      {state.step === 'basics' && <BasicsStep value={state.basics} onChange={(basics) => patch({ basics })} onNext={() => go('safety')} />}

      {state.step === 'safety' && <SafetyStep value={state.safety} onChange={(safety) => patch({ safety })} onBack={() => go('basics')} onNext={() => go('risk')} />}

      {state.step === 'risk' && riskIndex === REVEAL && assessment && (
        <ProfileReveal key="reveal" assessment={assessment} onBack={() => patch({ riskIndex: LAST_QUESTION })} onContinue={() => go('preferences')} />
      )}

      {state.step === 'risk' && riskIndex !== REVEAL && (
        <RiskStep
          key={riskIndex}
          index={riskIndex}
          answers={state.answers}
          onAnswer={(opt) => answer(riskIndex, opt)}
          onJump={(i) => {
            window.clearTimeout(advanceTimer.current);
            patch({ riskIndex: i });
          }}
          onBack={() => {
            window.clearTimeout(advanceTimer.current);
            if (riskIndex > 0) patch({ riskIndex: riskIndex - 1 });
            else go('safety');
          }}
          onNext={() => {
            window.clearTimeout(advanceTimer.current);
            advanceRisk(riskIndex);
          }}
        />
      )}

      {state.step === 'preferences' && (
        <PreferencesStep value={state.prefs} onChange={(prefs) => patch({ prefs })} onBack={() => patch({ step: 'risk', riskIndex: REVEAL })} onNext={() => go('building')} />
      )}

      {state.step === 'building' && result?.plan && assessment && (
        <BuildingStep plan={result.plan} assessment={assessment} riskTolerance={riskTolerance} overridden={overridden} onDone={() => go('plan')} />
      )}

      {(state.step === 'plan' || state.step === 'building') && result?.error && (
        <div className="error">
          Cannot build a plan: {result.error}{' '}
          <button type="button" className="btn" onClick={() => go('basics')}>
            Fix the basics
          </button>
        </div>
      )}

      {state.step === 'plan' && result?.plan && assessment && (
        <Results
          state={state}
          assessment={assessment}
          riskTolerance={riskTolerance}
          plan={result.plan}
          onOverride={(overrideRisk) => patch({ overrideRisk })}
          onEdit={(step) => (step === 'risk' ? patch({ step: 'risk', riskIndex: 0 }) : go(step))}
          onRestart={() => setState(INITIAL)}
          onSignals={(signalIds) => patch({ signalIds })}
        />
      )}
    </div>
  );
}
