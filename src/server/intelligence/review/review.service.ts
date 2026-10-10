import { offsetBounds, toOffsetPage } from "../../pagination";
import type { OffsetPage } from "../../types";
import type { AttemptRecord } from "../attempt.types";
import { groupBy } from "../group-by";
import { REVIEW_SYNC } from "../intelligence.config";
import { overdueDays } from "./due";
import {
  replayReviews,
  type ReviewEvent,
  type ReviewScheduler,
  type ReviewState,
} from "./review.scheduler";
import type {
  DueQuery,
  DueReview,
  DueReviewRequest,
  DueReviewRow,
  SavedReviewState,
} from "./review.types";

/** What this service needs from storage; declared here, next to its only consumer. */
export interface ReviewStore {
  /** Questions whose stored schedule has not caught up with the attempts, at most `limit`. */
  staleQuestionIds(userId: string, limit: number): Promise<string[]>;
  saveStates(userId: string, states: readonly SavedReviewState[]): Promise<void>;
  listDue(userId: string, query: DueQuery): Promise<DueReviewRow[]>;
  countDue(userId: string, now: Date): Promise<number>;
}

export interface ReviewHistory {
  list(
    userId: string,
    options: { questionIds: readonly string[]; limit: number },
  ): Promise<AttemptRecord[]>;
}

interface Dependencies {
  readonly store: ReviewStore;
  readonly history: ReviewHistory;
  readonly scheduler: ReviewScheduler;
  readonly clock: () => Date;
}

const roundTo1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * Keeps each question's stored review schedule equal to what the scheduler computes from the
 * student's attempt history, and lists what is due. The stored schedule is a cache: it is rebuilt by
 * replaying the history, so recomputing is always safe (docs/adr/0002).
 */
export class ReviewService {
  constructor(private readonly deps: Dependencies) {}

  /** Recomputes stale schedules, up to the per-request limit. Returns how many questions were updated. */
  async refreshStale(userId: string): Promise<number> {
    const { store, history, scheduler } = this.deps;
    let refreshed = 0;

    for (let round = 0; round < REVIEW_SYNC.maxBatches; round += 1) {
      const questionIds = await store.staleQuestionIds(userId, REVIEW_SYNC.staleBatchSize);
      if (questionIds.length === 0) break;

      const attempts = await history.list(userId, {
        questionIds,
        limit: REVIEW_SYNC.attemptsPerBatch,
      });
      const byQuestion = groupBy(attempts, (attempt) => attempt.questionId);
      const states = questionIds.flatMap((questionId) => {
        const events = byQuestion.get(questionId);
        return events === undefined
          ? []
          : [toSavedState(questionId, replayReviews(scheduler, events.map(toEvent)))];
      });
      if (states.length === 0) break; // nothing to replay: another round would find the same questions

      await store.saveStates(userId, states);
      refreshed += states.length;
      if (questionIds.length < REVIEW_SYNC.staleBatchSize) break;
    }
    return refreshed;
  }

  async listDue(userId: string, request: DueReviewRequest): Promise<OffsetPage<DueReview>> {
    const { offset, limit } = offsetBounds(request);
    await this.refreshStale(userId);

    const now = this.deps.clock();
    const rows = await this.deps.store.listDue(userId, {
      now,
      examType: request.examType,
      topic: request.topic,
      limit: limit + 1,
      offset,
    });
    const page = toOffsetPage(rows, limit, offset);
    return { ...page, items: page.items.map((row) => toDueReview(row, now)) };
  }

  async countDue(userId: string): Promise<number> {
    await this.refreshStale(userId);
    return this.deps.store.countDue(userId, this.deps.clock());
  }
}

const toEvent = (attempt: AttemptRecord): ReviewEvent => ({
  at: attempt.answeredAt,
  correct: attempt.correct,
  confidence: attempt.confidence,
});

function toSavedState(questionId: string, state: ReviewState): SavedReviewState {
  // Replaying at least one event always leaves both dates set.
  const { nextReviewAt, lastReviewedAt } = state;
  if (nextReviewAt === null || lastReviewedAt === null)
    throw new Error(`No schedule for question ${questionId}`);
  return {
    questionId,
    nextReviewAt,
    reviewCount: state.reviewCount,
    lastReviewedAt,
    status: state.status,
    intervalDays: state.intervalDays,
    ease: state.ease,
  };
}

function toDueReview(row: DueReviewRow, now: Date): DueReview {
  return {
    questionId: row.questionId,
    examType: row.question.exam_type,
    topic: row.question.topic,
    nextReviewAt: row.nextReviewAt.toISOString(),
    overdueDays: roundTo1(overdueDays({ nextReviewAt: row.nextReviewAt }, now)),
    status: row.status,
    reviewCount: row.reviewCount,
    intervalDays: row.intervalDays,
    question: {
      question_text: row.question.question_text,
      option_a: row.question.option_a,
      option_b: row.question.option_b,
      option_c: row.question.option_c,
      option_d: row.question.option_d,
    },
  };
}
