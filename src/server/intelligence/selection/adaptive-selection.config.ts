/** Weights and thresholds of adaptive question selection (docs/formulas.md, section 6). */
export interface AdaptiveSelectionConfig {
  /** Relative weight of each signal; they are combined as a weighted sum, so they should total 1. */
  readonly weights: {
    readonly weakTopic: number;
    readonly dueReview: number;
    readonly previousMistake: number;
    readonly lowExposure: number;
    readonly recentWeakness: number;
    readonly difficultyFit: number;
  };
  readonly dueReview: {
    /** Urgency of a question that has just become due; it rises to 1 as it becomes overdue. */
    readonly baseUrgency: number;
    /** Days overdue at which urgency reaches 1. */
    readonly saturationDays: number;
  };
  /** Misses of an unresolved question at which the mistake signal reaches 1. */
  readonly mistakeSaturation: number;
  /** Difficulty as a position between easy (0) and hard (1). */
  readonly difficultyLevel: {
    readonly easy: number;
    readonly medium: number;
    readonly hard: number;
  };
  /** Fit assumed when a question's difficulty is unknown. */
  readonly unknownDifficultyFit: number;
  /** Signal assumed when a topic has no recent-accuracy evidence. */
  readonly unknownRecentWeakness: number;
  /** The most any one topic may supply, as a share of the session, while other topics have questions. */
  readonly maxTopicShare: number;
}

export const ADAPTIVE_SELECTION_CONFIG = {
  weights: {
    weakTopic: 0.3,
    dueReview: 0.2,
    previousMistake: 0.2,
    lowExposure: 0.1,
    recentWeakness: 0.1,
    difficultyFit: 0.1,
  },
  dueReview: { baseUrgency: 0.5, saturationDays: 14 },
  mistakeSaturation: 3,
  difficultyLevel: { easy: 0, medium: 0.5, hard: 1 },
  unknownDifficultyFit: 0.5,
  unknownRecentWeakness: 0.5,
  maxTopicShare: 0.6,
} as const satisfies AdaptiveSelectionConfig;
