import type { ReviewEvent, ReviewScheduler, ReviewState, ReviewStatus } from "./review.scheduler";
import { SM2_CONFIG, type Sm2Config } from "./sm2.config";

const DAY_MS = 24 * 60 * 60 * 1000;
const roundTo2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * SuperMemo-2 spaced repetition. Intervals grow 1, 6, then by the ease factor after each success;
 * a wrong answer restarts the schedule and leaves the ease factor unchanged, as in the original
 * algorithm. Pure and deterministic; documented in docs/formulas.md (section 3).
 */
export class Sm2ReviewScheduler implements ReviewScheduler {
  constructor(private readonly config: Sm2Config = SM2_CONFIG) {}

  initialState(): ReviewState {
    return {
      status: "new",
      reviewCount: 0,
      lastReviewedAt: null,
      nextReviewAt: null,
      intervalDays: 0,
      ease: this.config.initialEase,
      repetitions: 0,
    };
  }

  next(state: ReviewState, event: ReviewEvent): ReviewState {
    const quality = this.quality(event);
    const passed = quality >= this.config.passQuality;

    const repetitions = passed ? state.repetitions + 1 : 0;
    const intervalDays = Math.min(
      this.interval(state, repetitions, passed),
      this.config.maxIntervalDays,
    );
    const ease = passed ? this.nextEase(state.ease, quality) : state.ease;

    return {
      status: this.status(repetitions, intervalDays, passed),
      reviewCount: state.reviewCount + 1,
      lastReviewedAt: event.at,
      nextReviewAt: new Date(event.at.getTime() + intervalDays * DAY_MS),
      intervalDays,
      ease,
      repetitions,
    };
  }

  private quality(event: ReviewEvent): number {
    const { quality } = this.config;
    return event.correct ? quality.correct[event.confidence ?? "unrated"] : quality.wrong;
  }

  /** The interval uses the ease factor from before this review, as in the original algorithm. */
  private interval(state: ReviewState, repetitions: number, passed: boolean): number {
    const { firstIntervalDays, secondIntervalDays, lapseIntervalDays } = this.config;
    if (!passed) return lapseIntervalDays;
    if (repetitions === 1) return firstIntervalDays;
    if (repetitions === 2) return secondIntervalDays;
    return Math.round(state.intervalDays * state.ease);
  }

  private nextEase(ease: number, quality: number): number {
    const shortfall = 5 - quality;
    return Math.max(
      this.config.minEase,
      roundTo2(ease + 0.1 - shortfall * (0.08 + shortfall * 0.02)),
    );
  }

  private status(repetitions: number, intervalDays: number, passed: boolean): ReviewStatus {
    const { learningRepetitions, masteredIntervalDays } = this.config;
    if (!passed || repetitions < learningRepetitions) return "learning";
    return intervalDays >= masteredIntervalDays ? "mastered" : "review";
  }
}
