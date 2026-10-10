import { EXAM_URGENCY_DAYS } from "../intelligence.config";
import type { UrgencyDays } from "../exam-urgency";

export type ReadinessComponent =
  | "mastery"
  | "accuracy"
  | "recent"
  | "mockExam"
  | "consistency"
  | "speed"
  | "coverage"
  | "repeatedMistakes";

/**
 * Tunable parameters of the readiness score (documented in docs/formulas.md, section 9). The score
 * is an internal preparation metric computed from past practice, not a prediction of any result.
 */
export interface ReadinessConfig {
  /** Relative weight of each component; components without data are dropped and the rest renormalised. */
  readonly weights: Readonly<Record<ReadinessComponent, number>>;
  /** Below this many attempts no score is given. */
  readonly minAttempts: number;
  /** Pseudo-attempts at 50% added to every accuracy, so a short run of right answers is not ready. */
  readonly accuracyPriorStrength: number;
  readonly recent: { readonly days: number; readonly minAttempts: number };
  readonly consistency: { readonly windowDays: number; readonly targetActiveDays: number };
  readonly speed: {
    readonly minTimedAttempts: number;
    /** A median at or below this scores 1. */
    readonly targetSeconds: number;
    /** A median at or above this scores 0. */
    readonly slowSeconds: number;
  };
  /** A topic counts as covered with at least this many attempts. */
  readonly coverage: { readonly minAttemptsPerTopic: number };
  readonly repeatedMistakes: {
    /** The share of attempted questions that are repeated mistakes at which the component scores 0. */
    readonly zeroAtShare: number;
  };
  readonly mockExam: { readonly sessionTypes: readonly string[]; readonly minAttempts: number };
  /** Score at or above which each band starts; below `developing` is `early`. */
  readonly bands: { readonly developing: number; readonly solid: number; readonly strong: number };
  /** A component below this is a weakness worth a recommendation. */
  readonly weakBelow: number;
  readonly maxWeakTopics: number;
  readonly maxRecommendations: number;
  readonly urgencyDays: UrgencyDays;
}

export const READINESS_CONFIG = {
  weights: {
    mastery: 0.25,
    accuracy: 0.1,
    recent: 0.15,
    mockExam: 0.15,
    consistency: 0.1,
    speed: 0.05,
    coverage: 0.1,
    repeatedMistakes: 0.1,
  },
  minAttempts: 30,
  accuracyPriorStrength: 10,
  recent: { days: 14, minAttempts: 10 },
  consistency: { windowDays: 14, targetActiveDays: 10 },
  speed: { minTimedAttempts: 20, targetSeconds: 90, slowSeconds: 240 },
  coverage: { minAttemptsPerTopic: 5 },
  repeatedMistakes: { zeroAtShare: 0.2 },
  mockExam: { sessionTypes: ["mock_exam", "timed_exam"], minAttempts: 20 },
  bands: { developing: 40, solid: 60, strong: 75 },
  weakBelow: 0.6,
  maxWeakTopics: 5,
  maxRecommendations: 3,
  urgencyDays: EXAM_URGENCY_DAYS,
} as const satisfies ReadinessConfig;
