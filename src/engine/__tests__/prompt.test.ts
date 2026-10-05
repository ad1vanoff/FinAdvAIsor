import { describe, expect, it } from 'vitest';
import { dynamicSystemPrompt, staticSystemPrompt, suggestedQuestions } from '../../assistant/prompt';
import { allocate } from '../allocate';
import { RULE_REFERENCES, SOURCES } from '../sources';

describe('assistant prompts', () => {
  it('static prompt is deterministic and cites every rule and source', () => {
    const a = staticSystemPrompt();
    const b = staticSystemPrompt();
    expect(a).toBe(b);
    for (const r of RULE_REFERENCES) expect(a).toContain(r.rule);
    for (const s of Object.values(SOURCES)) expect(a).toContain(s.url);
    expect(a).toMatch(/not a licensed financial adviser/);
    expect(a).not.toMatch(/\d{4}-\d{2}-\d{2}T/); // no timestamps, keeps the cache stable
  });

  it('dynamic prompt carries the plan numbers', () => {
    const plan = allocate({ amount: 150_000, horizonYears: 10, hasEmergencyFund: false, monthlyExpenses: 5_000, asOf: '2026-09-28' });
    const text = dynamicSystemPrompt({ stage: 'plan', plan, riskTolerance: 'conservative', answers: { 'Which statement fits you best?': 'I want growth' } });
    expect(text).toContain('$150,000.00');
    expect(text).toContain('$30,000');
    expect(text).toContain('Emergency fund');
    expect(text).toContain('I want growth');
  });

  it('dynamic prompt copes with no plan', () => {
    const text = dynamicSystemPrompt({ stage: 'basics' });
    expect(text).toContain('No plan has been built yet');
    expect(suggestedQuestions({ stage: 'basics' })).toHaveLength(4);
  });
});
