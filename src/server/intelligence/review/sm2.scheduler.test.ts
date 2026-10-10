import { describe, expect, it } from "vitest";
import type { Confidence } from "../attempt.types";
import { isDue, overdueDays } from "./due";
import {
  replayReviews,
  type ReviewEvent,
  type ReviewScheduler,
  type ReviewState,
} from "./review.scheduler";
import { SM2_CONFIG } from "./sm2.config";
import { Sm2ReviewScheduler } from "./sm2.scheduler";

const START = new Date("2026-10-01T09:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const day = (offset: number) => new Date(START.getTime() + offset * DAY_MS);
const review = (
  offset: number,
  correct: boolean,
  confidence: Confidence | null = null,
): ReviewEvent => ({
  at: day(offset),
  correct,
  confidence,
});

const scheduler = new Sm2ReviewScheduler();
const replay = (events: readonly ReviewEvent[]) => replayReviews(scheduler, events);

describe("Sm2ReviewScheduler: first review", () => {
  it("starts new, with nothing scheduled", () => {
    expect(scheduler.initialState()).toEqual({
      status: "new",
      reviewCount: 0,
      lastReviewedAt: null,
      nextReviewAt: null,
      intervalDays: 0,
      ease: 2.5,
      repetitions: 0,
    });
  });

  it("schedules a correct first review for the next day and keeps learning", () => {
    expect(replay([review(0, true)])).toMatchObject({
      status: "learning",
      reviewCount: 1,
      lastReviewedAt: day(0),
      nextReviewAt: day(1),
      intervalDays: 1,
      ease: 2.5,
      repetitions: 1,
    });
  });

  it("brings an incorrect first review back after the lapse interval", () => {
    expect(replay([review(0, false)])).toMatchObject({
      status: "learning",
      reviewCount: 1,
      nextReviewAt: day(1),
      intervalDays: 1,
      ease: 2.5,
      repetitions: 0,
    });
  });
});

describe("Sm2ReviewScheduler: growing intervals", () => {
  it("lengthens the interval 1, 6, then by the ease factor", () => {
    // reviewed on the day each review fell due: day 0, 1, 7, 22
    const events = [review(0, true), review(1, true), review(7, true), review(22, true)];
    const intervals = events.map((_, i) => replay(events.slice(0, i + 1)).intervalDays);
    // 1, 6, round(6 * 2.5) = 15, round(15 * 2.5) = round(37.5) = 38
    expect(intervals).toEqual([1, 6, 15, 38]);
  });

  it("moves from learning to review after two successes, then to mastered at 21 days", () => {
    const events = [review(0, true), review(1, true), review(7, true), review(22, true)];
    const statuses = events.map((_, i) => replay(events.slice(0, i + 1)).status);
    expect(statuses).toEqual(["learning", "review", "review", "mastered"]);
  });

  it("schedules the next review after the interval, counted from the review itself", () => {
    const state = replay([review(0, true), review(1, true)]);
    expect(state.nextReviewAt).toEqual(day(7)); // reviewed on day 1, interval 6
    expect(state.lastReviewedAt).toEqual(day(1));
    expect(state.reviewCount).toBe(2);
  });

  it("never schedules further out than the maximum interval", () => {
    const longRun = Array.from({ length: 20 }, (_, i) => review(i * 400, true, "high"));
    expect(replay(longRun).intervalDays).toBe(SM2_CONFIG.maxIntervalDays);
  });
});

describe("Sm2ReviewScheduler: mistakes", () => {
  it("restarts the schedule after a wrong answer but keeps the ease factor", () => {
    const state = replay([review(0, true), review(1, true), review(7, true), review(22, false)]);
    expect(state).toMatchObject({
      status: "learning",
      repetitions: 0,
      intervalDays: 1,
      nextReviewAt: day(23),
      ease: 2.5,
    });
    expect(state.reviewCount).toBe(4);
  });

  it("keeps a repeatedly missed question at the shortest interval", () => {
    const events = [review(0, false), review(1, false), review(2, false), review(3, false)];
    expect(replay(events)).toMatchObject({
      intervalDays: 1,
      nextReviewAt: day(4),
      reviewCount: 4,
      status: "learning",
    });
  });

  it("climbs again from the start once the question is answered correctly", () => {
    const state = replay([review(0, false), review(1, true), review(2, true)]);
    expect(state).toMatchObject({ intervalDays: 6, repetitions: 2, status: "review" });
  });
});

describe("Sm2ReviewScheduler: confidence and ease", () => {
  it("raises the ease for a confident correct answer and lowers it for a hesitant one", () => {
    // ease change = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)
    expect(replay([review(0, true, "high")]).ease).toBeCloseTo(2.6, 5); // q = 5
    expect(replay([review(0, true, "medium")]).ease).toBeCloseTo(2.5, 5); // q = 4
    expect(replay([review(0, true, "low")]).ease).toBeCloseTo(2.36, 5); // q = 3
  });

  it("treats a correct answer without a confidence like a medium one", () => {
    expect(replay([review(0, true, null)]).ease).toBe(replay([review(0, true, "medium")]).ease);
  });

  it("never lets the ease factor fall below the minimum", () => {
    const hesitant = Array.from({ length: 30 }, (_, i) => review(i, true, "low"));
    expect(replay(hesitant).ease).toBe(SM2_CONFIG.minEase);
  });

  it("uses a longer interval for an easy question than for a hard one", () => {
    const easy = replay([
      review(0, true, "high"),
      review(1, true, "high"),
      review(7, true, "high"),
    ]);
    const hard = replay([review(0, true, "low"), review(1, true, "low"), review(7, true, "low")]);
    expect(easy.intervalDays).toBeGreaterThan(hard.intervalDays);
  });
});

describe("replayReviews", () => {
  it("applies events oldest first however they are supplied, without changing the input", () => {
    const events = Object.freeze([review(7, true), review(0, true), review(1, true)]);
    expect(replay(events)).toEqual(replay([review(0, true), review(1, true), review(7, true)]));
  });

  it("returns the initial state for no events", () => {
    expect(replay([])).toEqual(scheduler.initialState());
  });
});

describe("due reviews", () => {
  const state = (nextReviewAt: Date | null): Pick<ReviewState, "nextReviewAt"> => ({
    nextReviewAt,
  });

  it("is due at and after the scheduled time, not before", () => {
    expect(isDue(state(day(5)), day(4))).toBe(false);
    expect(isDue(state(day(5)), day(5))).toBe(true);
    expect(isDue(state(day(5)), day(9))).toBe(true);
  });

  it("is never due before the first review", () => {
    expect(isDue(state(null), day(100))).toBe(false);
    expect(overdueDays(state(null), day(100))).toBe(0);
  });

  it("measures how long a review has been overdue, and zero when it is not", () => {
    expect(overdueDays(state(day(5)), day(8))).toBe(3);
    expect(overdueDays(state(day(5)), day(5))).toBe(0);
    expect(overdueDays(state(day(5)), day(2))).toBe(0);
  });
});

describe("ReviewScheduler seam", () => {
  /** A different algorithm behind the same interface: review again a week after every answer. */
  const weekly: ReviewScheduler = {
    initialState: () => ({
      status: "new",
      reviewCount: 0,
      lastReviewedAt: null,
      nextReviewAt: null,
      intervalDays: 0,
      ease: 1,
      repetitions: 0,
    }),
    next: (state, event) => ({
      ...state,
      status: "review",
      reviewCount: state.reviewCount + 1,
      lastReviewedAt: event.at,
      nextReviewAt: new Date(event.at.getTime() + 7 * DAY_MS),
      intervalDays: 7,
    }),
  };

  it("lets another algorithm replace SM-2 without touching the code that replays or checks due dates", () => {
    const state = replayReviews(weekly, [review(0, false), review(2, true)]);
    expect(state).toMatchObject({ reviewCount: 2, intervalDays: 7, nextReviewAt: day(9) });
    expect(isDue(state, day(9))).toBe(true);
  });
});
