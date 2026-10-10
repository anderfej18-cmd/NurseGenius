/** Rules of the study streak (documented in docs/formulas.md, section 10). */
export interface StreakConfig {
  /** Answered questions needed in a UTC day for it to count as a study day. */
  readonly minQuestionsPerDay: number;
  /** Streak lengths worth celebrating, ascending. */
  readonly milestones: readonly number[];
  /** How many days of history the streak is read from. */
  readonly windowDays: number;
}

export const STREAK_CONFIG = {
  minQuestionsPerDay: 5,
  milestones: [3, 7, 14, 30, 60, 100, 180, 365],
  windowDays: 366,
} as const satisfies StreakConfig;
