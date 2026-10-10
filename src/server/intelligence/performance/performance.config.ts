import { REPEATED_MISTAKE_MIN_MISSES } from "../intelligence.config";

/** Thresholds for the performance analysis (docs/formulas.md, section 16). */
export const PERFORMANCE_CONFIG = {
  /** Answers needed before any pattern is reported. */
  minAttempts: 30,
  /** The recent window; everything before it is "earlier". */
  windowDays: 14,
  /** Answers a topic needs before it is ranked as strong or weak. */
  minTopicAttempts: 8,
  /** Answers needed in both windows before a trend or a difference is reported. */
  minWindowAttempts: 5,
  /** Accuracy change, as a share, that counts as improving or declining. */
  trendDelta: 0.1,
  /** Accuracy gap between the recent window and earlier that is called out as inconsistent. */
  inconsistencyDelta: 0.15,
  /** A topic at or above this share correct is strong; below `weakBelow` it is weak. */
  strongAtOrAbove: 0.8,
  weakBelow: 0.6,
  repeatedMistakeMinMisses: REPEATED_MISTAKE_MIN_MISSES,
  /** Misses followed by a later attempt needed before the effect of revisiting is reported. */
  minRevisited: 10,
  /** Timed answers needed, and how much faster wrong answers must be than right ones, to mention pace. */
  pace: { minTimedAttempts: 30, rushedRatio: 0.7 },
  /** The most items listed in each part of the report. */
  maxListed: 5,
} as const;

export type PerformanceConfig = typeof PERFORMANCE_CONFIG;
