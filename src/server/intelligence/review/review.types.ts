import type { ExamType } from "../../types";
import type { ReviewStatus } from "./review.scheduler";

/** A schedule ready to be stored on a student's statistics row. */
export interface SavedReviewState {
  readonly questionId: string;
  readonly nextReviewAt: Date;
  readonly reviewCount: number;
  readonly lastReviewedAt: Date;
  readonly status: ReviewStatus;
  readonly intervalDays: number;
  readonly ease: number;
}

export interface DueQuery {
  readonly now: Date;
  readonly examType?: ExamType;
  readonly topic?: string;
  /** Includes the extra row used to detect a next page. */
  readonly limit: number;
  readonly offset: number;
}

/** A due question as stored; carries question content but never the answer key. */
export interface DueReviewRow {
  readonly questionId: string;
  readonly nextReviewAt: Date;
  readonly status: ReviewStatus;
  readonly reviewCount: number;
  readonly intervalDays: number;
  readonly question: {
    readonly exam_type: ExamType;
    readonly topic: string;
    readonly question_text: string;
    readonly option_a: string;
    readonly option_b: string;
    readonly option_c: string;
    readonly option_d: string;
  };
}

export interface DueReviewRequest {
  readonly examType?: ExamType;
  readonly topic?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface DueReview {
  readonly questionId: string;
  readonly examType: ExamType;
  readonly topic: string;
  readonly nextReviewAt: string;
  /** Days past the due time, one decimal. */
  readonly overdueDays: number;
  readonly status: ReviewStatus;
  readonly reviewCount: number;
  readonly intervalDays: number;
  readonly question: {
    readonly question_text: string;
    readonly option_a: string;
    readonly option_b: string;
    readonly option_c: string;
    readonly option_d: string;
  };
}
