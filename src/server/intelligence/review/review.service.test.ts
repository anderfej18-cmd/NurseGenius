import { describe, expect, it, vi } from "vitest";
import { ValidationError } from "@/lib/app-errors";
import type { AttemptRecord } from "../attempt.types";
import { REVIEW_SYNC } from "../intelligence.config";
import { replayReviews, type ReviewScheduler } from "./review.scheduler";
import { ReviewService, type ReviewHistory, type ReviewStore } from "./review.service";
import type { DueReviewRow, SavedReviewState } from "./review.types";
import { Sm2ReviewScheduler } from "./sm2.scheduler";

const NOW = new Date("2026-10-10T09:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const day = (offset: number) => new Date(NOW.getTime() + offset * DAY_MS);
const USER = "user-1";

const attempt = (questionId: string, daysFromNow: number, correct: boolean): AttemptRecord => ({
  questionId,
  topic: "Anatomy",
  examType: "RN",
  sessionId: `s-${questionId}-${daysFromNow}`,
  sessionType: "mixed",
  correct,
  answeredAt: day(daysFromNow),
  difficulty: null,
  confidence: null,
  timeSpentMs: null,
});

const dueRow = (questionId: string, nextReviewAt: Date): DueReviewRow => ({
  questionId,
  nextReviewAt,
  status: "review",
  reviewCount: 3,
  intervalDays: 6,
  question: {
    exam_type: "RN",
    topic: "Anatomy",
    question_text: `Q ${questionId}?`,
    option_a: "a",
    option_b: "b",
    option_c: "c",
    option_d: "d",
  },
});

function setup(
  options: {
    stale?: string[][];
    attempts?: AttemptRecord[];
    due?: DueReviewRow[];
    scheduler?: ReviewScheduler;
  } = {},
) {
  const staleRounds = [...(options.stale ?? [])];
  const store: ReviewStore = {
    staleQuestionIds: vi.fn().mockImplementation(async () => staleRounds.shift() ?? []),
    saveStates: vi.fn().mockResolvedValue(undefined),
    listDue: vi.fn().mockResolvedValue(options.due ?? []),
    countDue: vi.fn().mockResolvedValue((options.due ?? []).length),
  };
  const history: ReviewHistory = {
    list: vi
      .fn()
      .mockImplementation(async (_user: string, query: { questionIds: readonly string[] }) =>
        (options.attempts ?? []).filter((a) => query.questionIds.includes(a.questionId)),
      ),
  };
  const service = new ReviewService({
    store,
    history,
    scheduler: options.scheduler ?? new Sm2ReviewScheduler(),
    clock: () => NOW,
  });
  return { service, store, history };
}

const saved = (store: ReviewStore): SavedReviewState[] =>
  vi.mocked(store.saveStates).mock.calls.flatMap((call) => [...call[1]]);

describe("ReviewService.refreshStale", () => {
  it("replays each stale question's history through the scheduler and stores the schedule", async () => {
    const attempts = [attempt("q1", -9, true), attempt("q1", -8, true), attempt("q1", -2, true)];
    const { service, store } = setup({ stale: [["q1"]], attempts });

    expect(await service.refreshStale(USER)).toBe(1);
    // reviews on days -9, -8, -2: intervals 1, 6, round(6 * 2.5) = 15 -> next review on day 13
    expect(saved(store)).toEqual([
      {
        questionId: "q1",
        nextReviewAt: day(13),
        reviewCount: 3,
        lastReviewedAt: day(-2),
        status: "review",
        intervalDays: 15,
        ease: 2.5,
      },
    ]);
    expect(store.saveStates).toHaveBeenCalledWith(USER, expect.any(Array));
  });

  it("restarts a question's schedule after a wrong answer", async () => {
    const attempts = [attempt("q1", -5, true), attempt("q1", -4, true), attempt("q1", -1, false)];
    const { service, store } = setup({ stale: [["q1"]], attempts });
    await service.refreshStale(USER);
    expect(saved(store)[0]).toMatchObject({
      status: "learning",
      intervalDays: 1,
      nextReviewAt: day(0),
      reviewCount: 3,
    });
  });

  it("does nothing when every schedule is up to date", async () => {
    const { service, store, history } = setup({ stale: [] });
    expect(await service.refreshStale(USER)).toBe(0);
    expect(history.list).not.toHaveBeenCalled();
    expect(store.saveStates).not.toHaveBeenCalled();
  });

  it("skips a stale question that has no attempts to replay, without looping", async () => {
    const { service, store } = setup({ stale: [["ghost"], ["ghost"]], attempts: [] });
    expect(await service.refreshStale(USER)).toBe(0);
    expect(store.saveStates).not.toHaveBeenCalled();
    expect(store.staleQuestionIds).toHaveBeenCalledTimes(1);
  });

  it("works through several rounds and stops at the per-request limit", async () => {
    const ids = (round: number) =>
      Array.from({ length: REVIEW_SYNC.staleBatchSize }, (_, i) => `r${round}-${i}`);
    const rounds = Array.from({ length: REVIEW_SYNC.maxBatches + 2 }, (_, round) => ids(round));
    const attempts = rounds.flat().map((id) => attempt(id, -1, true));
    const { service, store } = setup({ stale: rounds, attempts });

    expect(await service.refreshStale(USER)).toBe(
      REVIEW_SYNC.staleBatchSize * REVIEW_SYNC.maxBatches,
    );
    expect(store.staleQuestionIds).toHaveBeenCalledTimes(REVIEW_SYNC.maxBatches);
  });

  it("stops after a short round, which means nothing is left", async () => {
    const attempts = [attempt("q1", -1, true)];
    const { service, store } = setup({ stale: [["q1"], ["never-asked"]], attempts });
    await service.refreshStale(USER);
    expect(store.staleQuestionIds).toHaveBeenCalledTimes(1);
  });

  it("only ever reads and writes the named student's data", async () => {
    const { service, store, history } = setup({
      stale: [["q1"]],
      attempts: [attempt("q1", -1, true)],
    });
    await service.refreshStale("student-42");
    expect(store.staleQuestionIds).toHaveBeenCalledWith("student-42", REVIEW_SYNC.staleBatchSize);
    expect(history.list).toHaveBeenCalledWith("student-42", {
      questionIds: ["q1"],
      limit: REVIEW_SYNC.attemptsPerBatch,
    });
    expect(store.saveStates).toHaveBeenCalledWith("student-42", expect.any(Array));
  });

  it("schedules with whichever algorithm it is given", async () => {
    const weekly: ReviewScheduler = {
      initialState: () => new Sm2ReviewScheduler().initialState(),
      next: (state, event) => ({
        ...state,
        status: "review",
        reviewCount: state.reviewCount + 1,
        lastReviewedAt: event.at,
        intervalDays: 7,
        nextReviewAt: new Date(event.at.getTime() + 7 * DAY_MS),
      }),
    };
    const { service, store } = setup({
      stale: [["q1"]],
      attempts: [attempt("q1", -3, true)],
      scheduler: weekly,
    });
    await service.refreshStale(USER);
    expect(saved(store)[0]).toMatchObject({ intervalDays: 7, nextReviewAt: day(4) });
    expect(
      replayReviews(weekly, [{ at: day(0), correct: true, confidence: null }]).intervalDays,
    ).toBe(7);
  });
});

describe("ReviewService.listDue", () => {
  it("brings schedules up to date, then lists what is due, most overdue first as the store orders it", async () => {
    const { service, store } = setup({
      stale: [["q1"]],
      attempts: [attempt("q1", -3, false)],
      due: [dueRow("q1", day(-2.5)), dueRow("q2", day(-0.25))],
    });
    const page = await service.listDue(USER, {});

    expect(vi.mocked(store.saveStates)).toHaveBeenCalled(); // refreshed before listing
    expect(vi.mocked(store.listDue).mock.invocationCallOrder[0]).toBeGreaterThan(
      vi.mocked(store.saveStates).mock.invocationCallOrder[0],
    );
    expect(page.items.map((r) => [r.questionId, r.overdueDays])).toEqual([
      ["q1", 2.5],
      ["q2", 0.3],
    ]);
    expect(page.nextOffset).toBeNull();
  });

  it("passes the clock, filters and a bounded page to the store", async () => {
    const { service, store } = setup();
    await service.listDue(USER, { examType: "RM", topic: "Ethics", limit: 10, offset: 20 });
    expect(store.listDue).toHaveBeenCalledWith(USER, {
      now: NOW,
      examType: "RM",
      topic: "Ethics",
      limit: 11,
      offset: 20,
    });
  });

  it("points at the next page only when more are due", async () => {
    const rows = Array.from({ length: 4 }, (_, i) => dueRow(`q${i}`, day(-1)));
    const { service } = setup({ due: rows });
    expect((await service.listDue(USER, { limit: 3 })).nextOffset).toBe(3);
    expect((await service.listDue(USER, { limit: 4 })).nextOffset).toBeNull();
  });

  it("reports nothing due as an empty page", async () => {
    const { service } = setup({ due: [] });
    expect(await service.listDue(USER, {})).toEqual({ items: [], nextOffset: null });
  });

  it("returns question content without any answer key", async () => {
    const { service } = setup({ due: [dueRow("q1", day(-1))] });
    expect(JSON.stringify(await service.listDue(USER, {}))).not.toMatch(/correct_answer|rationale/);
  });

  it("rejects an out-of-range page", async () => {
    const { service } = setup();
    await expect(service.listDue(USER, { offset: -1 })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("ReviewService.countDue", () => {
  it("counts the reviews due now after bringing schedules up to date", async () => {
    const { service, store } = setup({
      stale: [["q1"]],
      attempts: [attempt("q1", -3, false)],
      due: [dueRow("q1", day(-2))],
    });
    expect(await service.countDue(USER)).toBe(1);
    expect(store.countDue).toHaveBeenCalledWith(USER, NOW);
    expect(store.saveStates).toHaveBeenCalled();
  });
});
