import type { Confidence } from "../attempt.types";

/** Matches the CHECK constraint on `user_question_stats.review_status`. */
export type ReviewStatus = "new" | "learning" | "review" | "mastered";

/** One time a student answered a question: the scheduler's only input. */
export interface ReviewEvent {
  readonly at: Date;
  readonly correct: boolean;
  readonly confidence: Confidence | null;
}

export interface ReviewState {
  readonly status: ReviewStatus;
  /** Total reviews so far. */
  readonly reviewCount: number;
  readonly lastReviewedAt: Date | null;
  /** When the question should be shown again; null before the first review. */
  readonly nextReviewAt: Date | null;
  readonly intervalDays: number;
  readonly ease: number;
  /**
   * Consecutive successful reviews. Internal to the algorithm and not stored: the stored schedule is
   * a cache, always rebuilt by replaying the history (docs/adr/0002).
   */
  readonly repetitions: number;
}

/**
 * Decides when a question is due again. Pure: no clock, database or framework. The only
 * implementation today is `Sm2ReviewScheduler`; the interface is the seam for a future algorithm
 * (docs/adr/0003).
 */
export interface ReviewScheduler {
  initialState(): ReviewState;
  next(state: ReviewState, event: ReviewEvent): ReviewState;
}

/** The schedule after all `events`, applied oldest first whatever order they are given in. */
export function replayReviews(
  scheduler: ReviewScheduler,
  events: readonly ReviewEvent[],
): ReviewState {
  return [...events]
    .sort((a, b) => a.at.getTime() - b.at.getTime() || Number(a.correct) - Number(b.correct))
    .reduce((state, event) => scheduler.next(state, event), scheduler.initialState());
}
