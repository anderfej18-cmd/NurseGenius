import type { ReviewState } from "./review.scheduler";

const DAY_MS = 24 * 60 * 60 * 1000;

/** A question is due once its next review time has been reached. */
export function isDue(state: Pick<ReviewState, "nextReviewAt">, now: Date): boolean {
  return state.nextReviewAt !== null && state.nextReviewAt.getTime() <= now.getTime();
}

/** Whole and fractional days past the due time; 0 when not yet due. */
export function overdueDays(state: Pick<ReviewState, "nextReviewAt">, now: Date): number {
  if (!isDue(state, now) || state.nextReviewAt === null) return 0;
  return (now.getTime() - state.nextReviewAt.getTime()) / DAY_MS;
}
