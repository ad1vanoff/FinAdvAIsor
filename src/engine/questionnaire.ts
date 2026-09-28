import type { RiskTolerance } from './types';

/**
 * A short risk-profiling questionnaire, scored the way a planner's intake form
 * is: each answer earns points, the total maps to a profile, and a couple of
 * behavioural "knock-out" answers cap the profile regardless of the score.
 *
 * The bands are skewed conservative on purpose: the growth profile needs a
 * near-perfect score, and the middle of the range lands on "conservative".
 */

export type QuestionId = 'drawdown' | 'priority' | 'experience' | 'income' | 'share';

export interface QuestionOption {
  label: string;
  score: number;
}

export interface Question {
  id: QuestionId;
  prompt: string;
  help?: string;
  options: QuestionOption[];
}

/** questionId -> index of the chosen option */
export type Answers = Partial<Record<QuestionId, number>>;

export const RISK_QUESTIONS: Question[] = [
  {
    id: 'drawdown',
    prompt: 'Imagine your investments fell 20% over a few months. What would you most likely do?',
    help: 'There is no right answer. This is about how you would actually behave, not how you would like to.',
    options: [
      { label: 'Sell everything to stop further losses', score: 0 },
      { label: 'Sell some of it to reduce the risk', score: 1 },
      { label: 'Hold on and wait for a recovery', score: 2 },
      { label: 'Buy more while prices are lower', score: 3 },
    ],
  },
  {
    id: 'priority',
    prompt: 'Which statement fits you best?',
    options: [
      { label: 'Protecting what I have matters more than growing it', score: 0 },
      { label: 'I want growth, but would give some up to avoid big swings', score: 1 },
      { label: 'I am focused on long-term growth and can live with swings', score: 2 },
    ],
  },
  {
    id: 'experience',
    prompt: 'How much experience do you have with stocks and funds?',
    options: [
      { label: 'I am new to investing', score: 0 },
      { label: 'Some experience', score: 1 },
      { label: 'Experienced, including through a market downturn', score: 2 },
    ],
  },
  {
    id: 'income',
    prompt: 'How stable is your income over the next few years?',
    options: [
      { label: 'Uncertain or irregular', score: 0 },
      { label: 'Fairly stable', score: 1 },
      { label: 'Very stable, with room to keep saving', score: 2 },
    ],
  },
  {
    id: 'share',
    prompt: 'How much of your total savings is this money?',
    options: [
      { label: 'Most or all of it', score: 0 },
      { label: 'Around half', score: 1 },
      { label: 'A small part', score: 2 },
    ],
  },
];

export const MAX_RISK_SCORE = RISK_QUESTIONS.reduce((sum, q) => sum + Math.max(...q.options.map((o) => o.score)), 0);

const ORDER: RiskTolerance[] = ['very_conservative', 'conservative', 'moderate', 'growth'];

/** Lowest score that reaches each profile. */
export const SCORE_BANDS: ReadonlyArray<{ min: number; profile: RiskTolerance }> = [
  { min: 0, profile: 'very_conservative' },
  { min: 4, profile: 'conservative' },
  { min: 7, profile: 'moderate' },
  { min: 10, profile: 'growth' },
];

export interface RiskAssessment {
  score: number;
  maxScore: number;
  /** Profile implied by the score alone. */
  scoredProfile: RiskTolerance;
  /** Profile after behavioural caps. This is what the allocator should use. */
  riskTolerance: RiskTolerance;
  /** Why the final profile differs from the scored one, if it does. */
  reasons: string[];
}

export function isComplete(answers: Answers): boolean {
  return RISK_QUESTIONS.every((q) => answers[q.id] !== undefined);
}

export function assessRisk(answers: Answers): RiskAssessment {
  let score = 0;
  for (const q of RISK_QUESTIONS) {
    const idx = answers[q.id];
    if (idx === undefined) throw new Error(`question "${q.id}" is unanswered`);
    const option = q.options[idx];
    if (!option) throw new Error(`question "${q.id}" has no option ${idx}`);
    score += option.score;
  }

  const scoredProfile = [...SCORE_BANDS].reverse().find((b) => score >= b.min)!.profile;
  let profile = scoredProfile;
  const reasons: string[] = [];
  const capAt = (max: RiskTolerance, why: string) => {
    if (ORDER.indexOf(profile) > ORDER.indexOf(max)) {
      profile = max;
      reasons.push(why);
    }
  };

  if (answers.drawdown === 0) {
    capAt('conservative', 'Selling everything after a 20% fall would lock in losses, so the profile is capped at conservative regardless of score.');
  }
  if (answers.share === 0) {
    capAt('conservative', 'This is most of your savings, so the profile is capped at conservative to protect it.');
  }

  return { score, maxScore: MAX_RISK_SCORE, scoredProfile, riskTolerance: profile, reasons };
}
