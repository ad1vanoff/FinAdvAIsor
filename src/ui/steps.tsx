import { useEffect, useState } from 'react';
import { EMERGENCY_FUND_MONTHS, RISK_PROFILES, RISK_QUESTIONS, SCORE_BANDS, horizonEquityCap, money, pct } from '../engine';
import type { AccountType, Answers, RiskAssessment } from '../engine';
import { Confetti } from './art/Confetti';
import { ReserveJar } from './art/ReserveJar';
import { GlidePath } from './charts/GlidePath';
import { Choices, Field, StepShell, Toggle } from './controls';
import { parseMoney, validateBasics, validateSafety } from './state';
import type { Basics, Prefs, Safety } from './state';

const HORIZON_PRESETS = [1, 3, 5, 10, 20, 30];

export function BasicsStep({ value, onChange, onNext }: { value: Basics; onChange: (b: Basics) => void; onNext: () => void }) {
  const [touched, setTouched] = useState(false);
  const errors = validateBasics(value);
  const set = <K extends keyof Basics>(k: K, v: Basics[K]) => onChange({ ...value, [k]: v });
  const cap = horizonEquityCap(value.horizonYears);

  return (
    <StepShell
      eyebrow="Step 1 of 4"
      title="Let's start with the basics"
      subtitle="How much are you allocating, and when will you need it?"
      onNext={() => {
        setTouched(true);
        if (Object.keys(errors).length === 0) onNext();
      }}
    >
      <Field label="Amount to allocate" error={touched ? errors.amount : undefined}>
        <div className="money-input">
          <input
            type="text"
            inputMode="decimal"
            autoFocus
            placeholder="100,000"
            value={value.amount}
            onChange={(e) => set('amount', e.target.value)}
            aria-invalid={touched && !!errors.amount}
          />
        </div>
      </Field>

      <Field
        label="When will you need this money?"
        right={<strong className="num">{value.horizonYears === 40 ? '40+' : value.horizonYears} years</strong>}
        hint={
          value.horizonYears < 2
            ? 'Under two years: this money stays almost entirely in cash and short bonds.'
            : `Stocks are capped at ${pct(cap)} of the invested portfolio for this horizon.`
        }
      >
        <input type="range" min={0} max={40} step={1} value={value.horizonYears} onChange={(e) => set('horizonYears', Number(e.target.value))} aria-label="Years until needed" />
        <div className="chips" role="group" aria-label="Common horizons">
          {HORIZON_PRESETS.map((y) => (
            <button type="button" key={y} className="chip" aria-pressed={value.horizonYears === y} onClick={() => set('horizonYears', y)}>
              {y} yr
            </button>
          ))}
        </div>
        <GlidePath horizon={value.horizonYears} />
      </Field>

      <Field label="Your age (optional)" hint="Used only to cap stock exposure at 100 minus your age." error={touched ? errors.age : undefined}>
        <input type="text" inputMode="numeric" placeholder="e.g. 45" value={value.age} onChange={(e) => set('age', e.target.value)} style={{ maxWidth: 160 }} />
      </Field>
    </StepShell>
  );
}

export function SafetyStep({
  value,
  amount,
  onChange,
  onNext,
  onBack,
}: {
  value: Safety;
  amount: string;
  onChange: (s: Safety) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [touched, setTouched] = useState(false);
  const errors = validateSafety(value);
  const set = <K extends keyof Safety>(k: K, v: Safety[K]) => onChange({ ...value, [k]: v });

  const total = parseMoney(amount);
  const expenses = parseMoney(value.monthlyExpenses);
  const target = expenses && !Number.isNaN(expenses) ? expenses * EMERGENCY_FUND_MONTHS : 0;
  const reserved = total && !Number.isNaN(total) && target > 0 ? Math.min(total, target) : 0;
  const jar =
    value.hasEmergencyFund === true
      ? { fill: 1, label: 'Emergency fund covered', sublabel: 'Held outside this money' }
      : value.hasEmergencyFund === false
        ? target > 0
          ? { fill: reserved / target, label: `${money(reserved)} reserved`, sublabel: `${EMERGENCY_FUND_MONTHS} months × ${money(expenses!)}` }
          : { fill: 0, label: 'Emergency fund', sublabel: 'Enter monthly expenses to size it' }
        : { fill: 0, label: 'Your safety net', sublabel: 'Answer below to see it fill' };

  return (
    <StepShell
      eyebrow="Step 2 of 4"
      title="Your safety net"
      subtitle="A planner sets money aside before investing a cent. These two questions size that reserve."
      onBack={onBack}
      onNext={() => {
        setTouched(true);
        if (Object.keys(errors).length === 0) onNext();
      }}
    >
      <div className="safety-grid">
      <div className="fields">
      <Field label="Do you already have an emergency fund of about six months of expenses?" error={touched ? errors.hasEmergencyFund : undefined}>
        <Choices
          row
          label="Emergency fund"
          value={value.hasEmergencyFund}
          onChange={(v) => set('hasEmergencyFund', v)}
          options={[
            { value: true, label: 'Yes, that is covered', hint: 'Held separately from this money.' },
            { value: false, label: 'No, or not fully', hint: 'We will carve one out of this amount first.' },
          ]}
        />
      </Field>
      {value.hasEmergencyFund === false && (
        <Field label="Roughly what are your monthly expenses?" error={touched ? errors.monthlyExpenses : undefined} hint="Six months of this goes to an insured cash account before anything is invested.">
          <div className="money-input" style={{ maxWidth: 220 }}>
            <input type="text" inputMode="decimal" placeholder="4,000" value={value.monthlyExpenses} onChange={(e) => set('monthlyExpenses', e.target.value)} />
          </div>
        </Field>
      )}

      <Field label="Will you need any of this money within the next two years?" error={touched ? errors.hasNearTerm : undefined}>
        <Choices
          row
          label="Near-term need"
          value={value.hasNearTerm}
          onChange={(v) => set('hasNearTerm', v)}
          options={[
            { value: false, label: 'No' },
            { value: true, label: 'Yes', hint: 'A house deposit, tuition, a car...' },
          ]}
        />
      </Field>
      {value.hasNearTerm === true && (
        <Field label="How much will you need?" error={touched ? errors.nearTermNeed : undefined} hint="Parked in Treasury bills so it cannot lose value when you need it.">
          <div className="money-input" style={{ maxWidth: 220 }}>
            <input type="text" inputMode="decimal" placeholder="15,000" value={value.nearTermNeed} onChange={(e) => set('nearTermNeed', e.target.value)} />
          </div>
        </Field>
      )}
      </div>
      <ReserveJar fill={jar.fill} label={jar.label} sublabel={jar.sublabel} />
      </div>
    </StepShell>
  );
}

// ---------------------------------------------------------------------------
// Questionnaire
// ---------------------------------------------------------------------------

function QuestionDots({ index, answers, onJump }: { index: number; answers: Answers; onJump: (i: number) => void }) {
  return (
    <ol className="qdots" aria-label="Questions">
      {RISK_QUESTIONS.map((q, i) => {
        const answered = answers[q.id] !== undefined;
        const cls = i === index ? 'current' : answered ? 'answered' : 'todo';
        return (
          <li key={q.id} className={cls}>
            <button
              type="button"
              disabled={!answered && i !== index}
              onClick={() => onJump(i)}
              aria-current={i === index ? 'step' : undefined}
              aria-label={`Question ${i + 1}${answered ? ', answered' : ''}${i === index ? ', current' : ''}`}
              title={answered ? `Go back to question ${i + 1}` : undefined}
            >
              {i + 1}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function RiskStep({
  index,
  answers,
  onAnswer,
  onJump,
  onBack,
  onNext,
}: {
  index: number;
  answers: Answers;
  onAnswer: (optionIndex: number) => void;
  onJump: (questionIndex: number) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const q = RISK_QUESTIONS[index];
  const answer = answers[q.id];
  const prev = index > 0 ? RISK_QUESTIONS[index - 1] : null;
  const prevAnswer = prev && answers[prev.id] !== undefined ? prev.options[answers[prev.id]!].label : null;

  return (
    <StepShell
      eyebrow={`Step 3 of 4 · Question ${index + 1} of ${RISK_QUESTIONS.length}`}
      title={q.prompt}
      subtitle={q.help}
      onBack={onBack}
      onNext={onNext}
      canNext={answer !== undefined}
      nextLabel={index === RISK_QUESTIONS.length - 1 ? 'See my result' : 'Next question'}
    >
      <QuestionDots index={index} answers={answers} onJump={onJump} />
      {prevAnswer && (
        <div className="recap">
          <span className="secondary small">
            Previous answer: “{prevAnswer}”
          </span>
          <button type="button" className="linklike" onClick={onBack}>
            Change it
          </button>
        </div>
      )}
      <Choices key={q.id} label={q.prompt} value={answer} onChange={onAnswer} options={q.options.map((o, i) => ({ value: i, label: o.label }))} />
      <p className="hint">Choosing an answer moves you on. Use Back, the numbered dots, or “Change it” to revisit any question.</p>
    </StepShell>
  );
}

export function ProfileReveal({ assessment, onBack, onContinue }: { assessment: RiskAssessment; onBack: () => void; onContinue: () => void }) {
  const [count, setCount] = useState(0);
  const [stage, setStage] = useState(0);

  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const duration = 1200;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setCount(Math.round(eased * assessment.score));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setStage(1);
    };
    raf = requestAnimationFrame(tick);
    // Background tabs pause animation frames; make sure the result still lands.
    const fallback = window.setTimeout(() => {
      cancelAnimationFrame(raf);
      setCount(assessment.score);
      setStage((st) => (st === 0 ? 1 : st));
    }, duration + 600);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(fallback);
    };
  }, [assessment.score]);

  useEffect(() => {
    if (stage !== 1) return;
    const t = window.setTimeout(() => setStage(2), 450);
    return () => window.clearTimeout(t);
  }, [stage]);

  const slots = assessment.maxScore + 1;
  const bands = SCORE_BANDS.map((b, i) => ({ profile: b.profile, from: b.min, to: SCORE_BANDS[i + 1]?.min ?? slots }));
  const profile = RISK_PROFILES[assessment.riskTolerance];
  const capped = assessment.riskTolerance !== assessment.scoredProfile;

  return (
    <div className="step reveal">
      <Confetti fire={stage >= 1} />
      <div className="step-head">
        <span className="eyebrow">Step 3 of 4 · Your result</span>
        <h2>{stage === 0 ? 'Scoring your answers…' : `You are a ${profile.label.toLowerCase()} investor`}</h2>
      </div>

      <div className="score-row">
        <span className="score num">{count}</span>
        <span className="score-of">of {assessment.maxScore} points</span>
      </div>
      <div className="meter" role="img" aria-label={`Score ${assessment.score} of ${assessment.maxScore}: ${profile.label}`}>
        {bands.map((b) => (
          <div key={b.profile} className={`band${b.profile === assessment.riskTolerance && stage > 0 ? ' hit' : ''}`} style={{ flex: b.to - b.from }}>
            <span>{RISK_PROFILES[b.profile].label}</span>
          </div>
        ))}
        <div className="marker" style={{ left: `${((count + 0.5) / slots) * 100}%` }} />
      </div>

      {stage >= 1 && (
        <div className="reveal-body fade-up">
          <p className="profile-desc">{profile.description}</p>
          {capped && (
            <div className="callout">
              <strong>Why not {RISK_PROFILES[assessment.scoredProfile].label.toLowerCase()}?</strong> {assessment.reasons.join(' ')}
            </div>
          )}
          {stage >= 2 && (
            <ul className="plain fade-up">
              <li>
                Your plan will start at <strong>{pct(profile.baseEquity)} stocks</strong>, with the rest in bonds and cash.
              </li>
              <li>Your time horizon and age can only lower that share, never raise it.</li>
              <li>Next, a few optional preferences. Then the plan is built in front of you.</li>
            </ul>
          )}
        </div>
      )}

      <div className="step-nav">
        <button type="button" className="btn" onClick={onBack}>
          Back
        </button>
        <button type="button" className="btn primary" onClick={onContinue}>
          Continue to preferences
        </button>
      </div>
    </div>
  );
}

export function PreferencesStep({ value, onChange, onNext, onBack }: { value: Prefs; onChange: (p: Prefs) => void; onNext: () => void; onBack: () => void }) {
  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => onChange({ ...value, [k]: v });
  return (
    <StepShell eyebrow="Step 4 of 4" title="A few preferences" subtitle="All optional. The defaults are sensible for most people." onBack={onBack} onNext={onNext} nextLabel="Build my plan">
      <div className="toggle-list">
        <Toggle checked={value.needsIncome} onChange={(v) => set('needsIncome', v)} label="I want this money to produce income" hint="More bonds, dividend stocks and investment-grade credit." />
        <Toggle checked={value.inflationProtection} onChange={(v) => set('inflationProtection', v)} label="Include inflation-protected bonds (TIPS)" />
        <Toggle checked={value.includeInternational} onChange={(v) => set('includeInternational', v)} label="Include international stocks" />
        <Toggle checked={value.includeRealEstate} onChange={(v) => set('includeRealEstate', v)} label="Add a real estate slice (REITs)" hint="A tenth of the stock sleeve." />
        <Toggle checked={value.includeGold} onChange={(v) => set('includeGold', v)} label="Add a small gold hedge" hint="Capped at 5% of the portfolio." />
        <Toggle checked={value.esg} onChange={(v) => set('esg', v)} label="Show ESG-screened example funds" />
      </div>
      <Field label="Which kind of account will this sit in?">
        <select value={value.accountType} onChange={(e) => set('accountType', e.target.value as AccountType)} style={{ maxWidth: 360 }}>
          <option value="taxable">Taxable brokerage</option>
          <option value="tax_deferred">Tax-deferred (401(k), traditional IRA)</option>
          <option value="tax_free">Tax-free (Roth)</option>
        </select>
      </Field>
    </StepShell>
  );
}
