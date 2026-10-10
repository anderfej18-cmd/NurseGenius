import { EXAM_URGENCY_DAYS, PACE_SECONDS } from "../intelligence.config";

/** Rules of the deterministic daily plan (docs/formulas.md, section 8). */
export interface RecommendationConfig {
  /** Study time the student can offer, in minutes. */
  readonly minutes: { readonly default: number; readonly min: number; readonly max: number };
  /** Seconds per question assumed when the student's own pace is unknown, and the bounds put on a known one. */
  readonly seconds: { readonly default: number; readonly min: number; readonly max: number };
  /** Bounds on the number of questions in a day's plan. */
  readonly questions: { readonly min: number; readonly max: number };
  /** The least that topic practice gets, as a share of the plan; the rest is shared by the other blocks. */
  readonly minTopicShare: number;
  /** Target share of the plan for each of the other blocks. */
  readonly shares: {
    readonly dueReviews: number;
    readonly mistakeReview: number;
    readonly speedPractice: number;
  };
  /** A block smaller than this is left out, unless fewer questions exist to put in it. */
  readonly minBlockQuestions: number;
  /** Topics practised in a day. */
  readonly topicBlocks: { readonly default: number; readonly highUrgency: number };
  /** Added to a topic's priority while its recent accuracy is falling. */
  readonly decliningBonus: number;
  /** Days to the exam at or below which urgency applies. */
  readonly urgencyDays: { readonly high: number; readonly medium: number; readonly low: number };
  /** Days without practice after which the plan mentions it. */
  readonly returnAfterDays: number;
}

export const RECOMMENDATION_CONFIG = {
  minutes: { default: 30, min: 10, max: 240 },
  seconds: PACE_SECONDS,
  questions: { min: 10, max: 100 },
  minTopicShare: 0.4,
  shares: { dueReviews: 0.3, mistakeReview: 0.2, speedPractice: 0.1 },
  minBlockQuestions: 5,
  topicBlocks: { default: 2, highUrgency: 3 },
  decliningBonus: 0.1,
  urgencyDays: EXAM_URGENCY_DAYS,
  returnAfterDays: 3,
} as const satisfies RecommendationConfig;
