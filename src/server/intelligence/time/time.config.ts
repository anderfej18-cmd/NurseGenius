/** Thresholds of the time analytics (docs/formulas.md, section 5). */
export interface TimeConfig {
  /** Times above this are treated as the student leaving the question open, not as working on it. */
  readonly maxPlausibleMs: number;
  /** An attempt is "fast" at or below this multiple of the student's median time. */
  readonly fastFactor: number;
  /** An attempt is "slow" at or above this multiple of the student's median time. */
  readonly slowFactor: number;
  /** Timed attempts needed before patterns and insights are reported. */
  readonly minTimedForPatterns: number;
  readonly trend: {
    /** Timed attempts in each of the two windows compared. */
    readonly window: number;
    readonly minPrevious: number;
    /** Relative change in average time that counts as a trend. */
    readonly delta: number;
  };
  readonly insights: {
    /** Attempts of a pattern needed before it is mentioned. */
    readonly minCount: number;
    /** Share of timed attempts at which each pattern is mentioned. */
    readonly rushing: number;
    readonly struggling: number;
    readonly carefulButSlow: number;
    readonly efficient: number;
  };
  /** Questions listed as the slowest. */
  readonly slowestQuestions: number;
}

export const TIME_CONFIG = {
  maxPlausibleMs: 10 * 60 * 1000,
  fastFactor: 0.6,
  slowFactor: 1.5,
  minTimedForPatterns: 10,
  trend: { window: 20, minPrevious: 10, delta: 0.1 },
  insights: { minCount: 3, rushing: 0.15, struggling: 0.15, carefulButSlow: 0.25, efficient: 0.25 },
  slowestQuestions: 5,
} as const satisfies TimeConfig;
