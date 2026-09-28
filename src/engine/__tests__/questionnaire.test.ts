import { describe, expect, it } from 'vitest';
import { MAX_RISK_SCORE, RISK_QUESTIONS, SCORE_BANDS, assessRisk, isComplete } from '../questionnaire';
import type { Answers, QuestionId } from '../questionnaire';
import type { RiskTolerance } from '../types';

const ORDER: RiskTolerance[] = ['very_conservative', 'conservative', 'moderate', 'growth'];
const rank = (p: RiskTolerance) => ORDER.indexOf(p);

const all = (idx: 'max' | 'min'): Answers =>
  Object.fromEntries(RISK_QUESTIONS.map((q) => [q.id, idx === 'max' ? q.options.length - 1 : 0])) as Answers;

/** Build an answer set that hits an exact score, without touching the knock-out answers. */
function withScore(target: number): Answers {
  const a = all('max');
  let score = MAX_RISK_SCORE;
  for (const q of RISK_QUESTIONS) {
    while (score > target && (a[q.id] ?? 0) > 1) {
      a[q.id]! -= 1;
      score -= 1;
    }
  }
  if (score !== target) throw new Error(`cannot build score ${target} without knock-outs`);
  return a;
}

describe('scoring', () => {
  it('has an 11-point scale', () => {
    expect(MAX_RISK_SCORE).toBe(11);
  });

  it('maps the extremes', () => {
    expect(assessRisk(all('max')).riskTolerance).toBe('growth');
    expect(assessRisk(all('min')).riskTolerance).toBe('very_conservative');
  });

  it('applies the score bands at their boundaries', () => {
    for (const band of SCORE_BANDS) {
      if (band.min < 5) continue; // lower scores cannot be built without knock-out answers
      expect(assessRisk(withScore(band.min)).scoredProfile).toBe(band.profile);
      expect(assessRisk(withScore(band.min - 1)).scoredProfile).not.toBe(band.profile);
    }
  });

  it('needs a near-perfect score to reach growth', () => {
    expect(assessRisk(withScore(9)).riskTolerance).toBe('moderate');
    expect(assessRisk(withScore(10)).riskTolerance).toBe('growth');
  });
});

describe('behavioural caps', () => {
  it('caps at conservative when the answer is to sell everything', () => {
    const a = assessRisk({ ...all('max'), drawdown: 0 });
    expect(a.scoredProfile).toBe('moderate');
    expect(a.riskTolerance).toBe('conservative');
    expect(a.reasons).toHaveLength(1);
  });

  it('caps at conservative when this is most of the savings', () => {
    const a = assessRisk({ ...all('max'), share: 0 });
    expect(a.scoredProfile).toBe('moderate');
    expect(a.riskTolerance).toBe('conservative');
    expect(a.reasons[0]).toMatch(/most of your savings/);
  });

  it('never raises a profile', () => {
    const a = assessRisk({ ...all('min'), drawdown: 0 });
    expect(a.riskTolerance).toBe('very_conservative');
    expect(a.reasons).toHaveLength(0);
  });
});

describe('monotonicity', () => {
  it('answering more confidently never lowers the profile', () => {
    const ids = RISK_QUESTIONS.map((q) => q.id);
    const combos: Answers[] = [];
    const walk = (i: number, acc: Answers) => {
      if (i === ids.length) return void combos.push({ ...acc });
      for (let k = 0; k < RISK_QUESTIONS[i].options.length; k++) walk(i + 1, { ...acc, [ids[i]]: k });
    };
    walk(0, {});
    const result = new Map(combos.map((c) => [JSON.stringify(c), rank(assessRisk(c).riskTolerance)]));
    for (const a of combos) {
      for (const b of combos) {
        const dominated = ids.every((id: QuestionId) => a[id]! <= b[id]!);
        if (dominated) expect(result.get(JSON.stringify(a))!).toBeLessThanOrEqual(result.get(JSON.stringify(b))!);
      }
    }
  });
});

describe('validation', () => {
  it('reports completeness', () => {
    expect(isComplete({})).toBe(false);
    expect(isComplete(all('min'))).toBe(true);
  });

  it('throws on unanswered or out-of-range answers', () => {
    expect(() => assessRisk({ drawdown: 1 })).toThrow(/unanswered/);
    expect(() => assessRisk({ ...all('min'), priority: 9 })).toThrow(/no option/);
  });
});
