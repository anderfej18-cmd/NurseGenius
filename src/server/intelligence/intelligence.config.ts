/** Limits shared by every intelligence function. */
import type { UrgencyDays } from "./exam-urgency";

/**
 * The most attempts analysed per request, newest first. Bounds the cost of one request as a
 * student's history grows (docs/adr/0002).
 */
export const MAX_ATTEMPTS_ANALYSED = 5000;

/** Questions sent to the database in one difficulty-statistics request. */
export const DIFFICULTY_STATS_BATCH = 5000;

export interface EmpiricalDifficultyConfig {
  readonly minAttempts: number;
  /** Share correct at or above which a question counts as easy. */
  readonly easyAtOrAbove: number;
  /** Share correct at or below which a question counts as hard. */
  readonly hardAtOrBelow: number;
}

/**
 * Difficulty learned from how all students fared on a question (docs/formulas.md, section 4).
 * Used only for questions without an admin-set difficulty, and only with enough attempts.
 */
export const EMPIRICAL_DIFFICULTY = {
  minAttempts: 20,
  easyAtOrAbove: 0.75,
  hardAtOrBelow: 0.45,
} as const satisfies EmpiricalDifficultyConfig;

/** How much schedule recomputation one request may do (docs/adr/0002). */
export const REVIEW_SYNC = {
  /** Stale questions recomputed per round trip. */
  staleBatchSize: 200,
  /** Rounds per request; anything left is recomputed by the next request. */
  maxBatches: 5,
  /** Attempts read for one round of questions. */
  attemptsPerBatch: 20000,
} as const;

/** Days to the exam at or below which each urgency level applies (docs/formulas.md, sections 8 and 9). */
export const EXAM_URGENCY_DAYS = { high: 14, medium: 30, low: 60 } as const satisfies UrgencyDays;

/** A question missed this many times and not answered correctly since is a repeated mistake. */
export const REPEATED_MISTAKE_MIN_MISSES = 2;

/**
 * Seconds per question assumed when a student's own pace is unknown, and the bounds put on a known
 * one so a single outlier cannot make a day or a plan absurd. Shared by the daily plan and study plans.
 */
export const PACE_SECONDS = { default: 60, min: 15, max: 300 } as const;
