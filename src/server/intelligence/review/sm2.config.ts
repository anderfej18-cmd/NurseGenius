import type { Confidence } from "../attempt.types";

/** Parameters of the SM-2 scheduler (docs/formulas.md, section 3). */
export interface Sm2Config {
  readonly initialEase: number;
  readonly minEase: number;
  readonly firstIntervalDays: number;
  readonly secondIntervalDays: number;
  /** Interval after a wrong answer. */
  readonly lapseIntervalDays: number;
  readonly maxIntervalDays: number;
  /** SM-2 quality grade (0 to 5) given to an answer. */
  readonly quality: {
    readonly wrong: number;
    readonly correct: Readonly<Record<Confidence | "unrated", number>>;
  };
  /** Grades below this reset the schedule (original SM-2: 3). */
  readonly passQuality: number;
  /** A question stays "learning" until this many reviews in a row were successful. */
  readonly learningRepetitions: number;
  /** An interval this long or longer marks the question "mastered" for review purposes. */
  readonly masteredIntervalDays: number;
}

export const SM2_CONFIG = {
  initialEase: 2.5,
  minEase: 1.3,
  firstIntervalDays: 1,
  secondIntervalDays: 6,
  lapseIntervalDays: 1,
  maxIntervalDays: 365,
  quality: { wrong: 1, correct: { low: 3, medium: 4, high: 5, unrated: 4 } },
  passQuality: 3,
  learningRepetitions: 2,
  masteredIntervalDays: 21,
} as const satisfies Sm2Config;
