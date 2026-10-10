import type { Difficulty, ExamType } from "../types";

export type Confidence = "low" | "medium" | "high";
export type { Difficulty };

/**
 * One answered question, the unit every intelligence engine reasons about. Built from a completed
 * session's answered rows; unanswered questions are not attempts.
 */
export interface AttemptSignal {
  readonly questionId: string;
  readonly topic: string;
  readonly examType: ExamType;
  /** The exam the attempt belongs to; attempts of one session are graded together. */
  readonly sessionId: string;
  readonly correct: boolean;
  /** When the student answered; sessions answered before timing was recorded use the completion time. */
  readonly answeredAt: Date;
  /** Admin-set or empirical difficulty; null when unknown (the engines never guess one). */
  readonly difficulty: Difficulty | null;
  /** What the student reported; null when the student was not asked. */
  readonly confidence: Confidence | null;
  /** Client-reported, advisory; null when not recorded. */
  readonly timeSpentMs: number | null;
}

/** An attempt as read from the database: the signal plus facts only some engines use. */
export interface AttemptRecord extends AttemptSignal {
  /** How the session was created (mixed, topic_practice, mock_exam, ...). */
  readonly sessionType: string;
}
