import type { TopicMastery } from "../mastery/mastery.service";

export type { ExamUrgency } from "../exam-urgency";
import type { ExamUrgency } from "../exam-urgency";

/** Everything a strategy may base the day's plan on: measured facts, no raw history. */
export interface RecommendationInput {
  readonly now: Date;
  readonly availableMinutes: number;
  readonly topics: readonly TopicMastery[];
  /** Questions due for review today. */
  readonly dueReviews: number;
  /** Questions the student missed and has not answered correctly since. */
  readonly unresolvedMistakes: number;
  readonly activity: {
    readonly activeDaysLast7: number;
    /** Whole days since the student last answered a question; null if they never have. */
    readonly daysSinceLastStudy: number | null;
  };
  readonly exam: {
    /** The exam date the student set, as YYYY-MM-DD; null if none. */
    readonly date: string | null;
    /** Whole days until the exam; negative once it has passed; null if no date. */
    readonly daysToExam: number | null;
  };
  readonly pace: {
    readonly averageSecondsPerQuestion: number | null;
    /** Right answers that take unusually long (docs/formulas.md, section 5). */
    readonly slowButAccurate: boolean;
  };
  /** Questions the student may still start today; null when their tier has no daily cap. */
  readonly remainingToday: number | null;
}

interface BlockBase {
  readonly title: string;
  readonly questions: number;
  /** Why this block is in the plan, in plain words. */
  readonly reason: string;
}

export type PlanBlock =
  | (BlockBase & { readonly kind: "due_reviews" })
  | (BlockBase & { readonly kind: "mistake_review" })
  | (BlockBase & {
      readonly kind: "topic_practice";
      readonly topic: string;
      readonly mastery: number;
    })
  | (BlockBase & { readonly kind: "mixed_practice" })
  | (BlockBase & { readonly kind: "speed_practice" });

export interface DailyPlan {
  /** The UTC day the plan is for, as YYYY-MM-DD. */
  readonly date: string;
  readonly availableMinutes: number;
  readonly totalQuestions: number;
  readonly estimatedMinutes: number;
  readonly urgency: ExamUrgency;
  readonly daysToExam: number | null;
  /** True when today's question allowance is used up, so nothing more can be started. */
  readonly limitReached: boolean;
  readonly blocks: readonly PlanBlock[];
  readonly notes: readonly string[];
}

/**
 * Turns the measured picture of a student into the day's plan. The deterministic strategy is the
 * only implementation; this interface is the seam a later strategy plugs into (docs/adr/0003).
 */
export interface RecommendationStrategy {
  recommend(input: RecommendationInput): DailyPlan;
}
