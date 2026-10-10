import type { Confidence, Difficulty } from "../attempt.types";
import { REPEATED_MISTAKE_MIN_MISSES } from "../intelligence.config";

/**
 * Tunable parameters of the topic-mastery formula (documented in docs/formulas.md, section 1).
 * Nothing here is a prediction of exam performance: these are weights of a transparent score.
 */
export interface MasteryConfig {
  /** Relative weight of each component; components without data are dropped and the rest renormalised. */
  readonly weights: {
    readonly accuracy: number;
    readonly recency: number;
    readonly consistency: number;
    readonly difficulty: number;
    readonly calibration: number;
  };
  /** An attempt's weight in `accuracy` halves every this many days. */
  readonly recencyHalfLifeDays: number;
  /** `recency` is the accuracy over this many most recent attempts. */
  readonly recentWindowAttempts: number;
  readonly consistency: {
    /** A session counts toward consistency only with at least this many attempts in the topic. */
    readonly minAttemptsPerSession: number;
    readonly minSessions: number;
    /** A session "passes" when its accuracy in the topic reaches this share. */
    readonly passMark: number;
  };
  readonly difficulty: {
    /** Harder questions weigh more when judging performance by difficulty. */
    readonly weights: Readonly<Record<Difficulty, number>>;
    readonly minAttempts: number;
  };
  readonly calibration: {
    /** The share of correct answers a student reporting this confidence is expected to achieve. */
    readonly expected: Readonly<Record<Confidence, number>>;
    readonly minAttempts: number;
  };
  readonly repeatedMistakes: {
    /** A question missed this many times and still unresolved counts as a repeated mistake. */
    readonly minMisses: number;
    /** Subtracted from the raw score, scaled by the share of attempted questions that are repeated mistakes. */
    readonly maxPenalty: number;
  };
  readonly shrinkage: {
    /** Score assumed when there is no evidence. */
    readonly prior: number;
    /** Attempts needed before the evidence outweighs the prior (evidence = n / (n + strength)). */
    readonly strength: number;
  };
  readonly levels: {
    readonly minAttempts: number;
    readonly developing: number;
    readonly proficient: number;
    readonly mastered: number;
    readonly masteredMinEvidence: number;
  };
  readonly trend: {
    /** Attempts needed in the earlier window before a trend is reported. */
    readonly minPreviousAttempts: number;
    /** Change in accuracy between windows that counts as a trend. */
    readonly delta: number;
  };
}

export const MASTERY_CONFIG = {
  weights: { accuracy: 0.4, recency: 0.2, consistency: 0.15, difficulty: 0.15, calibration: 0.1 },
  recencyHalfLifeDays: 30,
  recentWindowAttempts: 10,
  consistency: { minAttemptsPerSession: 3, minSessions: 2, passMark: 0.6 },
  difficulty: { weights: { easy: 0.5, medium: 1, hard: 1.5 }, minAttempts: 5 },
  calibration: { expected: { low: 0.4, medium: 0.65, high: 0.9 }, minAttempts: 5 },
  repeatedMistakes: { minMisses: REPEATED_MISTAKE_MIN_MISSES, maxPenalty: 0.15 },
  shrinkage: { prior: 0.5, strength: 10 },
  levels: {
    minAttempts: 5,
    developing: 0.5,
    proficient: 0.7,
    mastered: 0.85,
    masteredMinEvidence: 0.75,
  },
  trend: { minPreviousAttempts: 5, delta: 0.1 },
} as const satisfies MasteryConfig;
