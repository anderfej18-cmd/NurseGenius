/** Thresholds for the confidence patterns (docs/formulas.md, section 2). */
export interface ConfidenceConfig {
  /** Rated attempts needed before any pattern is flagged. */
  readonly minRatedAttempts: number;
  readonly falseConfidence: {
    /** Wrong answers given with high confidence needed to flag. */
    readonly minCount: number;
    /** Share of high-confidence answers that were wrong needed to flag. */
    readonly minErrorRate: number;
  };
  readonly weakConfidence: {
    /** Correct answers given with low confidence needed to flag. */
    readonly minCount: number;
    /** Share of low-confidence answers that were right needed to flag. */
    readonly minSuccessRate: number;
  };
}

export const CONFIDENCE_CONFIG = {
  minRatedAttempts: 5,
  falseConfidence: { minCount: 3, minErrorRate: 0.25 },
  weakConfidence: { minCount: 3, minSuccessRate: 0.5 },
} as const satisfies ConfidenceConfig;
