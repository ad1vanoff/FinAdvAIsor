import { useMemo, useState } from 'react';
import { ASSET_CLASSES, ASSET_CLASS_SOURCES, DEMO_SIGNALS, RISK_PROFILES, RISK_QUESTIONS, RULE_REFERENCES, SOURCES, compareProfiles, formatPlanText, money, pct, ruleReference } from '../engine';
import type { AllocationPlan, AssetClassId, MarketSignal, RiskAssessment, RiskTolerance } from '../engine';
import { AllocationPie } from './AllocationPie';
import { FanChart } from './charts/FanChart';
import { RiskReturnMap } from './charts/RiskReturnMap';
import { PlanTable } from './PlanTable';
import { Research } from './Research';
import type { RuleEvaluation } from '../research/signals';
import type { ResearchSnapshot } from '../research/types';
import { SourceLinks, Tabs } from './controls';
import { parseMoney, toAllocationInput } from './state';
import type { StepId, WizardState } from './state';

export interface ResearchFeed {
  enabled: boolean;
  onToggle: (on: boolean) => void;
  snap: ResearchSnapshot | null;
  loading: boolean;
  error: string | null;
  evaluations: RuleEvaluation[];
  signals: MarketSignal[];
}

type TabId = 'allocation' | 'outlook' | 'why' | 'signals' | 'research' | 'sources' | 'answers';

const ruleSources = (id: string) => ruleReference(id)?.sourceIds ?? [];

export function Results({
  state,
  assessment,
  riskTolerance,
  plan,
  onOverride,
  onEdit,
  onRestart,
  onSignals,
  research,
}: {
  state: WizardState;
  assessment: RiskAssessment;
  riskTolerance: RiskTolerance;
  plan: AllocationPlan;
  onOverride: (r: RiskTolerance | null) => void;
  onEdit: (step: StepId) => void;
  onRestart: () => void;
  onSignals: (ids: string[]) => void;
  research: ResearchFeed;
}) {
  const [tab, setTab] = useState<TabId>('allocation');
  const [selected, setSelected] = useState<string | null>(null);
  const s = plan.summary;
  const invested = s.investableDollars > 0;
  const overridden = state.overrideRisk !== null && state.overrideRisk !== assessment.riskTolerance;
  const copy = (text: string) => navigator.clipboard?.writeText(text);
  const comparisons = useMemo(() => compareProfiles(toAllocationInput(state, riskTolerance, research.signals)), [state, riskTolerance, research.signals]);

  return (
    <div className="results fade-up">
      <div className="profile-strip panel">
        <div>
          <span className="eyebrow">Your risk profile</span>
          <h2>
            {RISK_PROFILES[riskTolerance].label}
            {overridden && <span className="pill" style={{ marginLeft: 8 }}>overridden</span>}
          </h2>
          <p className="secondary small">
            {overridden
              ? `Your answers suggest ${RISK_PROFILES[assessment.riskTolerance].label.toLowerCase()} (scored ${assessment.score} of ${assessment.maxScore}).`
              : `Scored ${assessment.score} of ${assessment.maxScore} on the questionnaire. ${RISK_PROFILES[riskTolerance].description}`}
          </p>
        </div>
        <div className="actions">
          <button type="button" className="btn" onClick={() => onEdit('risk')}>
            Retake questionnaire
          </button>
          <button type="button" className="btn" onClick={onRestart}>
            Start over
          </button>
        </div>
      </div>

      <Tabs
        tabs={[
          { id: 'allocation', label: 'Allocation' },
          { id: 'outlook', label: 'Outlook' },
          { id: 'why', label: 'Why this mix', badge: plan.warnings.length || undefined },
          { id: 'signals', label: 'Market signals', badge: plan.signals.applied.length || undefined },
          { id: 'research', label: 'Research' },
          { id: 'sources', label: 'Sources' },
          { id: 'answers', label: 'Your answers' },
        ]}
        active={tab}
        onChange={(id) => setTab(id as TabId)}
      >
        {tab === 'allocation' && (
          <div className="stack">
            <div className="tiles">
              <div className="tile">
                <span className="label">Total</span>
                <span className="value">{money(s.totalAmount)}</span>
                <span className="sub">{s.reservesDollars > 0 ? `${money(s.reservesDollars)} reserved, ${money(s.investableDollars)} invested` : 'all invested'}</span>
              </div>
              <div className="tile">
                <span className="label">Invested mix</span>
                <span className="value">{invested ? `${pct(s.equityWeight)} / ${pct(s.fixedIncomeWeight)}` : '—'}</span>
                <span className="sub">
                  {invested ? `stocks / bonds, ${pct(s.cashWeight)} cash${s.alternativesWeight > 0 ? `, ${pct(s.alternativesWeight)} alternatives` : ''}` : 'nothing to invest yet'}
                </span>
              </div>
              <div className="tile">
                <span className="label">Stock ceiling</span>
                <span className="value">{pct(s.equityCap)}</span>
                <span className="sub">{s.equityCapReason}</span>
              </div>
              <div className="tile">
                <span className="label">Rough outlook</span>
                <span className="value">{pct(s.expectedReturn, 1)} / yr</span>
                <span className="sub">a bad year near {pct(s.typicalBadYear, 1)}; assumption-driven</span>
              </div>
            </div>

            <div className="panel">
              <div className="section-title">
                <h2>Where the money goes</h2>
                <span className="small muted">share of the total amount</span>
              </div>
              <AllocationPie plan={plan} selected={selected} onSelect={setSelected} />
            </div>

            <div className="panel">
              <div className="section-title">
                <h2>Line by line</h2>
                <div className="actions">
                  <button type="button" className="btn" onClick={() => copy(formatPlanText(plan))}>
                    Copy as text
                  </button>
                  <button type="button" className="btn" onClick={() => copy(JSON.stringify(plan, null, 2))}>
                    Copy JSON
                  </button>
                </div>
              </div>
              <PlanTable plan={plan} selected={selected} onSelect={setSelected} />
            </div>

            {plan.warnings.length > 0 && (
              <div className="warning">
                <strong>Check these</strong>
                <ul>
                  {plan.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="disclaimer">{plan.disclaimer}</p>
          </div>
        )}

        {tab === 'outlook' && (
          <div className="stack outlook-grid">
            <div className="panel">
              <div className="section-title">
                <h2>Range of outcomes over {state.basics.horizonYears === 40 ? '40+' : state.basics.horizonYears} years</h2>
                <span className="small muted">for the {money(invested ? s.investableDollars : s.totalAmount)} {invested ? 'invested' : 'total'}</span>
              </div>
              <FanChart start={invested ? s.investableDollars : s.totalAmount} expectedReturn={s.expectedReturn} volatility={s.expectedVolatility} years={Math.max(1, state.basics.horizonYears)} />
            </div>
            <div className="panel">
              <div className="section-title">
                <h2>Where your plan sits</h2>
                <span className="small muted">risk versus return across the four profiles</span>
              </div>
              <RiskReturnMap comparisons={comparisons} current={{ expectedReturn: s.expectedReturn, volatility: s.expectedVolatility }} currentProfile={riskTolerance} />
            </div>
            <p className="disclaimer">
              Both charts use the round, long-run return and volatility assumptions listed on the Sources tab. They describe the shape of the risk being taken, not what will happen.
            </p>
          </div>
        )}

        {tab === 'why' && (
          <div className="stack">
            <div className="panel notes">
              <h2>How this plan was built</h2>
              <ol className="steps-list">
                <li>
                  <strong>Reserves first.</strong>{' '}
                  {s.reservesDollars > 0 ? `${money(s.reservesDollars)} was set aside before investing.` : 'Nothing needed to be set aside; the whole amount is invested.'}
                  <br />
                  <SourceLinks ids={[...ruleSources('emergency_fund'), ...ruleSources('near_term')]} />
                </li>
                <li>
                  <strong>Profile, then caps.</strong> The {RISK_PROFILES[riskTolerance].label.toLowerCase()} profile starts at {pct(RISK_PROFILES[riskTolerance].baseEquity)} stocks. The stock ceiling is{' '}
                  {pct(s.equityCap)}, set by {s.equityCapReason}. Caps only ever lower the stock share.
                  <br />
                  <SourceLinks ids={[...ruleSources('risk_profile'), ...ruleSources('horizon_cap')]} />
                </li>
                <li>
                  <strong>Signals.</strong>{' '}
                  {plan.signals.applied.length > 0 ? `${plan.signals.applied.length} market signal(s) nudged the mix within their limits.` : 'No market signals are active, so the mix is the strategic baseline.'}
                </li>
                <li>
                  <strong>Fill each sleeve</strong> with a diversified mix, fold away positions under 2%, and reconcile the dollars.
                  <br />
                  <SourceLinks ids={[...ruleSources('diversification'), ...ruleSources('tips')]} />
                </li>
              </ol>
              <p className="hint" style={{ marginTop: 10 }}>
                Every rule and its reading is listed on the{' '}
                <button type="button" className="linklike" onClick={() => setTab('sources')}>
                  Sources tab
                </button>
                .
              </p>
            </div>

            <div className="panel">
              <h2>How the stock share was set</h2>
              <ol className="derivation">
                {plan.derivation.map((d) => (
                  <li key={d.stage}>
                    <span className="num d-val">{pct(d.equity)}</span>
                    <span>
                      <strong className="d-stage">{d.stage}</strong> {d.note}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            {assessment.reasons.length > 0 && (
              <div className="panel">
                <h2>About your profile</h2>
                <ul className="plain">
                  {assessment.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="panel notes">
              <h2>Notes on this plan</h2>
              <ul className="plain">
                {plan.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>

            <div className="panel">
              <h2>Keeping it on track</h2>
              <p className="secondary" style={{ marginTop: 6 }}>
                {plan.rebalancing.description}
              </p>
              <SourceLinks ids={ruleSources('rebalancing')} />
            </div>

            <div className="panel">
              <h2>Rough outlook</h2>
              <p className="secondary" style={{ marginTop: 6 }}>
                Using round, long-run assumptions for each asset class, this mix has an expected return around {pct(s.expectedReturn, 1)} a year with volatility near{' '}
                {pct(s.expectedVolatility, 1)}. A bad year could be around {pct(s.typicalBadYear, 1)}. These describe the shape of the risk, not a forecast.
              </p>
              <SourceLinks ids={ruleSources('assumptions')} />
            </div>

            {plan.warnings.length > 0 && (
              <div className="warning">
                <strong>Check these</strong>
                <ul>
                  {plan.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {tab === 'signals' && (
          <div className="stack">
            <div className="panel">
              <h2>Demo signals</h2>
              <p className="secondary" style={{ marginTop: 6 }}>
                These are illustrative stand-ins for a future news layer. Each signal nudges one dimension by a bounded amount, risk-on signals count half as much as risk-off ones, and nothing can push
                stocks above the ceiling. Toggle a few and watch the allocation tab change.
              </p>
              <div className="signals">
                {Object.values(DEMO_SIGNALS).map((sig) => {
                  const on = state.signalIds.includes(sig.id);
                  return (
                    <label className="signal" key={sig.id}>
                      <input type="checkbox" checked={on} onChange={(e) => onSignals(e.target.checked ? [...state.signalIds, sig.id] : state.signalIds.filter((x) => x !== sig.id))} />
                      <span>
                        <span className="dim">
                          {sig.dimension} {sig.direction > 0 ? '▲' : '▼'}
                        </span>
                        <br />
                        <span>{sig.rationale}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="panel">
              <h2>Signals from validated research</h2>
              <p className="secondary" style={{ marginTop: 6 }}>
                Simple rules read the Verified figures on the Research tab and, when one trips, send the allocator a signal. They only ever argue for <strong>less</strong> risk (trim stocks, hold
                more cash, lean to TIPS), they expire when their data goes stale, and the same caps apply as for every other signal. Figures that are not Verified are never used.
              </p>
              <label className="signal" style={{ marginTop: 10 }}>
                <input type="checkbox" checked={research.enabled} onChange={(e) => research.onToggle(e.target.checked)} />
                <span>Apply research-driven signals to my plan</span>
              </label>
              {research.enabled && research.loading && !research.snap && <p className="small muted" style={{ marginTop: 8 }}>Fetching and validating the latest figures…</p>}
              {research.enabled && research.error && (
                <p className="small" style={{ marginTop: 8, color: 'var(--danger)' }} role="alert">
                  {research.error} No research signals are applied until it loads.
                </p>
              )}
              {research.snap && (
                <div className="sig-list" style={{ marginTop: 10 }}>
                  {research.evaluations.map((e) => (
                    <div className={`row${e.triggered ? '' : ' muted'}`} key={e.id}>
                      <span className="pill">{!e.usable ? 'not run' : e.triggered ? (research.enabled ? 'applied' : 'would apply') : 'quiet'}</span>
                      <span>
                        <strong>{e.label}</strong>: {e.rule}
                        <br />
                        <span className="small">{e.detail}</span>
                      </span>
                    </div>
                  ))}
                  <p className="small muted">Data fetched {new Date(research.snap.fetchedAt).toLocaleString()}. Details and sources are on the Research tab.</p>
                </div>
              )}
            </div>
            {(plan.signals.applied.length > 0 || plan.signals.ignored.length > 0) && (
              <div className="panel">
                <h2>What they did</h2>
                <div className="sig-list">
                  {plan.signals.applied.map((a) => (
                    <div className="row" key={a.id}>
                      <span className="pill">{a.dimension}</span>
                      <span>
                        <strong>{a.id}</strong>: {a.effect}
                      </span>
                    </div>
                  ))}
                  {plan.signals.ignored.map((a) => (
                    <div className="row muted" key={a.id}>
                      <span className="pill">ignored</span>
                      <span>
                        <strong>{a.id}</strong>: {a.reason}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'research' && <Research />}

        {tab === 'sources' && <Sources plan={plan} />}

        {tab === 'answers' && <Answers state={state} assessment={assessment} riskTolerance={riskTolerance} onEdit={onEdit} onOverride={onOverride} />}
      </Tabs>
    </div>
  );
}

function Sources({ plan }: { plan: AllocationPlan }) {
  const classes = [...new Set(plan.lines.map((l) => l.assetClass))] as AssetClassId[];
  return (
    <div className="stack">
      <div className="panel">
        <h2>Where the rules come from</h2>
        <p className="secondary" style={{ marginTop: 6 }}>
          The splits are rules of thumb that regulators, the Treasury and large fund managers publish for individual investors, tuned to the conservative side. Each rule below says
          exactly how this tool uses it and links to the reading behind it.
        </p>
        <ol className="rules">
          {RULE_REFERENCES.map((r) => (
            <li key={r.id}>
              <strong>{r.rule}</strong>
              <div className="secondary small">{r.howUsed}</div>
              {r.sourceIds.length > 0 ? <SourceLinks ids={r.sourceIds} /> : <span className="src muted">No external source: a deliberate design choice of this tool.</span>}
            </li>
          ))}
        </ol>
      </div>

      <div className="panel">
        <h2>Reading on each position in your plan</h2>
        <ul className="plain">
          {classes.map((id) => (
            <li key={id}>
              <strong>{ASSET_CLASSES[id].name}</strong>
              <br />
              <SourceLinks ids={ASSET_CLASS_SOURCES[id]} label="Read" />
            </li>
          ))}
        </ul>
      </div>

      <div className="panel">
        <h2>All sources</h2>
        <ul className="plain">
          {Object.values(SOURCES).map((src) => (
            <li key={src.id}>
              <a href={src.url} target="_blank" rel="noopener noreferrer">
                {src.title}
              </a>{' '}
              <span className="muted">· {src.publisher}</span>
            </li>
          ))}
        </ul>
        <p className="hint" style={{ marginTop: 10 }}>
          Links open in a new tab. Example fund tickers in the plan are illustrations of each category, not recommendations.
        </p>
      </div>
    </div>
  );
}

function Answers({
  state,
  assessment,
  riskTolerance,
  onEdit,
  onOverride,
}: {
  state: WizardState;
  assessment: RiskAssessment;
  riskTolerance: RiskTolerance;
  onEdit: (step: StepId) => void;
  onOverride: (r: RiskTolerance | null) => void;
}) {
  const b = state.basics;
  const sf = state.safety;
  const p = state.prefs;
  const amount = parseMoney(b.amount) ?? 0;
  const yes = (v: boolean) => (v ? 'Yes' : 'No');
  const account = { taxable: 'Taxable brokerage', tax_deferred: 'Tax-deferred', tax_free: 'Tax-free (Roth)' }[p.accountType];

  const Section = ({ title, step, rows }: { title: string; step: StepId; rows: [string, string][] }) => (
    <div className="panel">
      <div className="section-title">
        <h2>{title}</h2>
        <button type="button" className="btn" onClick={() => onEdit(step)}>
          Edit
        </button>
      </div>
      <dl className="answers">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );

  return (
    <div className="stack">
      <Section
        title="Basics"
        step="basics"
        rows={[
          ['Amount', money(amount)],
          ['Needed in', `${b.horizonYears === 40 ? '40+' : b.horizonYears} years`],
          ['Age', b.age.trim() ? b.age : 'Not given'],
        ]}
      />
      <Section
        title="Safety net"
        step="safety"
        rows={[
          ['Emergency fund in place', sf.hasEmergencyFund === null ? '—' : yes(sf.hasEmergencyFund)],
          ...(sf.hasEmergencyFund === false ? ([['Monthly expenses', money(parseMoney(sf.monthlyExpenses) ?? 0)]] as [string, string][]) : []),
          ['Needed within two years', sf.hasNearTerm ? money(parseMoney(sf.nearTermNeed) ?? 0) : 'No'],
        ]}
      />
      <Section
        title="Risk questionnaire"
        step="risk"
        rows={RISK_QUESTIONS.map((q) => [q.prompt, state.answers[q.id] === undefined ? '—' : q.options[state.answers[q.id]!].label])}
      />
      <div className="panel">
        <div className="section-title">
          <h2>Profile used for the plan</h2>
        </div>
        <p className="secondary small">
          Your answers scored {assessment.score} of {assessment.maxScore}, which maps to {RISK_PROFILES[assessment.riskTolerance].label.toLowerCase()}.
          {assessment.reasons.length > 0 && ` ${assessment.reasons.join(' ')}`} You can use a different profile to compare, but the questionnaire's answer is the recommended one.
        </p>
        <div className="field" style={{ maxWidth: 360, marginTop: 10 }}>
          <label htmlFor="override">Profile</label>
          <select id="override" value={riskTolerance} onChange={(e) => onOverride(e.target.value === assessment.riskTolerance ? null : (e.target.value as RiskTolerance))}>
            {(Object.keys(RISK_PROFILES) as RiskTolerance[]).map((r) => (
              <option key={r} value={r}>
                {RISK_PROFILES[r].label}
                {r === assessment.riskTolerance ? ' (from your answers)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Section
        title="Preferences"
        step="preferences"
        rows={[
          ['Income focus', yes(p.needsIncome)],
          ['Inflation-protected bonds', yes(p.inflationProtection)],
          ['International stocks', yes(p.includeInternational)],
          ['Real estate', yes(p.includeRealEstate)],
          ['Gold', yes(p.includeGold)],
          ['ESG examples', yes(p.esg)],
          ['Account', account],
        ]}
      />
    </div>
  );
}
