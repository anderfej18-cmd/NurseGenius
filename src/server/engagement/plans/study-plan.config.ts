import { PACE_SECONDS } from "../../intelligence/intelligence.config";

/** Rules of the study plan (documented in docs/formulas.md, section 13). */
export interface StudyPlanConfig {
  readonly dailyMinutes: { readonly min: number; readonly max: number; readonly default: number };
  readonly daysPerWeek: { readonly min: number; readonly max: number; readonly default: number };
  readonly targetScore: { readonly min: number; readonly max: number; readonly default: number };
  /** Seconds per question when the student's pace is unknown, and the bounds on a known one. */
  readonly seconds: { readonly default: number; readonly min: number; readonly max: number };
  /** A plan runs up to this many weeks before the exam. */
  readonly maxWeeks: number;
  /** Every topic's weight is this plus how far its mastery is below the target (as a fraction). */
  readonly baseWeight: number;
  /** Mastery assumed for a topic the student has not practised. */
  readonly unseenMastery: number;
  /** A topic is planned for at most this many passes through its questions. */
  readonly maxPassesPerTopic: number;
  readonly finalWeek: {
    /** Share of the final week's questions given to reviewing weak topics. */
    readonly reviewShare: number;
    /** Topics reviewed in the final week. */
    readonly reviewTopics: number;
    /** The most questions in the final week's mock exam. */
    readonly mockMaxQuestions: number;
  };
  readonly progress: {
    /** Done ÷ planned-so-far below this is "behind", above the second is "ahead". */
    readonly behindBelow: number;
    readonly aheadAbove: number;
  };
}

export const STUDY_PLAN_CONFIG = {
  dailyMinutes: { min: 10, max: 240, default: 30 },
  daysPerWeek: { min: 1, max: 7, default: 5 },
  targetScore: { min: 50, max: 100, default: 80 },
  seconds: PACE_SECONDS,
  maxWeeks: 52,
  baseWeight: 0.25,
  unseenMastery: 50,
  maxPassesPerTopic: 2,
  finalWeek: { reviewShare: 0.6, reviewTopics: 3, mockMaxQuestions: 50 },
  progress: { behindBelow: 0.7, aheadAbove: 1.1 },
} as const satisfies StudyPlanConfig;
