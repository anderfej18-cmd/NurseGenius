import { describe, expect, it, vi } from "vitest";
import { NotFoundError, ValidationError } from "@/lib/app-errors";
import type { Quota } from "../../sessions/session.types";
import type { AttemptRecord } from "../attempt.types";
import { MasteryService } from "../mastery/mastery.service";
import { TimeAnalyticsService } from "../time/time-analytics.service";
import { DeterministicRecommendationStrategy } from "./deterministic.strategy";
import { RecommendationService, type StudyProfile } from "./recommendation.service";
import type {
  DailyPlan,
  RecommendationInput,
  RecommendationStrategy,
} from "./recommendation.types";

const NOW = new Date("2026-10-10T15:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const USER = "user-1";

const quota = (overrides: Partial<Quota> = {}): Quota => ({
  tier: "novice",
  expiryDate: null,
  questionsToday: 0,
  lastQuestionDate: null,
  ...overrides,
});
const profile = (overrides: Partial<StudyProfile> = {}): StudyProfile => ({
  examDate: null,
  quota: quota(),
  ...overrides,
});

let counter = 0;
const attempt = (
  topic: string,
  correct: boolean,
  daysAgo: number,
  timeSpentMs: number | null = null,
): AttemptRecord => {
  counter += 1;
  return {
    questionId: `q${counter}`,
    topic,
    examType: "RN",
    sessionId: `s-${topic}-${Math.floor(counter / 5)}`,
    sessionType: "mixed",
    correct,
    answeredAt: new Date(NOW.getTime() - daysAgo * DAY_MS),
    difficulty: null,
    confidence: null,
    timeSpentMs,
  };
};
const run = (
  topic: string,
  count: number,
  correct: boolean,
  daysAgo = 1,
  timeSpentMs: number | null = null,
) => Array.from({ length: count }, () => attempt(topic, correct, daysAgo, timeSpentMs));

const stubPlan: DailyPlan = {
  date: "2026-10-10",
  availableMinutes: 30,
  totalQuestions: 0,
  estimatedMinutes: 0,
  urgency: "none",
  daysToExam: null,
  limitReached: false,
  blocks: [],
  notes: ["stub"],
};

function setup(
  options: {
    attempts?: AttemptRecord[];
    due?: number;
    unresolved?: number;
    profile?: StudyProfile | null;
    strategy?: RecommendationStrategy;
  } = {},
) {
  const spy = vi.fn<(input: RecommendationInput) => DailyPlan>().mockReturnValue(stubPlan);
  const strategy = options.strategy ?? { recommend: spy };
  const deps = {
    strategy,
    history: { load: vi.fn().mockResolvedValue(options.attempts ?? []) },
    mastery: new MasteryService(),
    time: new TimeAnalyticsService(),
    reviews: { countDue: vi.fn().mockResolvedValue(options.due ?? 0) },
    store: {
      countUnresolvedMistakes: vi.fn().mockResolvedValue(options.unresolved ?? 0),
      getStudyProfile: vi
        .fn()
        .mockResolvedValue(options.profile === undefined ? profile() : options.profile),
    },
    clock: () => NOW,
  };
  return { service: new RecommendationService(deps), deps, spy };
}
const given = (spy: ReturnType<typeof setup>["spy"]) => spy.mock.calls[0][0];

describe("RecommendationService.today: gathering the picture", () => {
  it("hands the strategy the student's measured picture, and returns its plan", async () => {
    const attempts = [
      ...run("Organic Chemistry", 20, false, 2),
      ...run("Atomic Structure", 20, true, 1),
    ];
    const { service, spy } = setup({ attempts, due: 12, unresolved: 8 });
    const result = await service.today(USER, {});

    expect(result).toBe(stubPlan);
    const input = given(spy);
    expect(input).toMatchObject({
      now: NOW,
      availableMinutes: 30,
      dueReviews: 12,
      unresolvedMistakes: 8,
    });
    expect(input.topics.map((t) => t.topic)).toEqual(["Organic Chemistry", "Atomic Structure"]); // weakest first
  });

  it("derives recent activity from the days the student answered questions", async () => {
    const attempts = [
      attempt("A", true, 0.2),
      attempt("A", true, 0.3),
      attempt("A", true, 2),
      attempt("A", true, 5),
      attempt("A", true, 12),
    ];
    const { service, spy } = setup({ attempts });
    await service.today(USER, {});
    // 2026-10-10 (x2), 10-08, 10-05 are within the last 7 days; 09-28 is not
    expect(given(spy).activity).toEqual({ activeDaysLast7: 3, daysSinceLastStudy: 0 });
  });

  it("counts the whole days since the student last practised", async () => {
    const { service, spy } = setup({ attempts: [attempt("A", true, 4.2)] });
    await service.today(USER, {});
    expect(given(spy).activity.daysSinceLastStudy).toBe(4);
  });

  it("knows a student who has never practised", async () => {
    const { service, spy } = setup({ attempts: [] });
    await service.today(USER, {});
    expect(given(spy).activity).toEqual({ activeDaysLast7: 0, daysSinceLastStudy: null });
    expect(given(spy).topics).toEqual([]);
  });

  it("counts the days to the exam from the date the student set", async () => {
    const { service, spy } = setup({ profile: profile({ examDate: "2026-10-24" }) });
    await service.today(USER, {});
    expect(given(spy).exam).toEqual({ date: "2026-10-24", daysToExam: 14 });
  });

  it("reports an exam date that has passed as negative days, and no date as none", async () => {
    const past = setup({ profile: profile({ examDate: "2026-10-07" }) });
    await past.service.today(USER, {});
    expect(given(past.spy).exam.daysToExam).toBe(-3);

    const none = setup();
    await none.service.today(USER, {});
    expect(given(none.spy).exam).toEqual({ date: null, daysToExam: null });
  });

  it("measures the student's pace from their answer times", async () => {
    const { service, spy } = setup({ attempts: run("A", 12, true, 1, 45_000) });
    await service.today(USER, {});
    expect(given(spy).pace).toMatchObject({ averageSecondsPerQuestion: 45 });
  });

  it("flags a student who answers correctly but slowly", async () => {
    const attempts = [...run("A", 4, true, 1, 12_000), ...run("A", 8, true, 1, 4_000)];
    const { service, spy } = setup({ attempts });
    await service.today(USER, {});
    expect(given(spy).pace.slowButAccurate).toBe(true);
  });

  it("leaves the pace unknown when no answer times were recorded", async () => {
    const { service, spy } = setup({ attempts: run("A", 12, true, 1, null) });
    await service.today(USER, {});
    expect(given(spy).pace).toEqual({ averageSecondsPerQuestion: null, slowButAccurate: false });
  });

  it("passes on how many questions the student may still start today", async () => {
    const limited = setup({
      profile: profile({ quota: quota({ questionsToday: 45, lastQuestionDate: "2026-10-10" }) }),
    });
    await limited.service.today(USER, {});
    expect(given(limited.spy).remainingToday).toBe(5);

    const unlimited = setup({
      profile: profile({ quota: quota({ tier: "scholar", expiryDate: "2027-01-01T00:00:00Z" }) }),
    });
    await unlimited.service.today(USER, {});
    expect(given(unlimited.spy).remainingToday).toBeNull();
  });
});

describe("RecommendationService.today: the request", () => {
  it("plans for the study time the student offers, 30 minutes by default", async () => {
    const { service, spy } = setup();
    await service.today(USER, {});
    await service.today(USER, { availableMinutes: 90 });
    expect(spy.mock.calls.map((call) => call[0].availableMinutes)).toEqual([30, 90]);
  });

  it.each([9, 241, 0, -5])("rejects %s minutes", async (minutes) => {
    const { service, deps } = setup();
    await expect(service.today(USER, { availableMinutes: minutes })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(deps.history.load).not.toHaveBeenCalled();
  });

  it("refuses a student that has no profile", async () => {
    const { service } = setup({ profile: null });
    await expect(service.today(USER, {})).rejects.toBeInstanceOf(NotFoundError);
  });

  it("reads only the named student's data", async () => {
    const { service, deps } = setup();
    await service.today("student-42", {});
    expect(deps.history.load).toHaveBeenCalledWith("student-42");
    expect(deps.reviews.countDue).toHaveBeenCalledWith("student-42");
    expect(deps.store.countUnresolvedMistakes).toHaveBeenCalledWith("student-42");
    expect(deps.store.getStudyProfile).toHaveBeenCalledWith("student-42");
  });
});

describe("RecommendationService: the strategy seam", () => {
  it("returns whatever the strategy in use plans, so another strategy can replace the deterministic one", async () => {
    const custom: RecommendationStrategy = {
      recommend: () => ({ ...stubPlan, notes: ["from another strategy"] }),
    };
    const { service } = setup({ strategy: custom });
    expect((await service.today(USER, {})).notes).toEqual(["from another strategy"]);
  });

  it("produces a real plan with the deterministic strategy", async () => {
    const attempts = [
      ...run("Organic Chemistry", 25, false, 2),
      ...run("Atomic Structure", 25, true, 2),
    ];
    const { service } = setup({
      attempts,
      due: 10,
      unresolved: 6,
      strategy: new DeterministicRecommendationStrategy(),
    });
    const plan = await service.today(USER, {});
    expect(plan.blocks.map((b) => b.kind)).toContain("due_reviews");
    expect(plan.blocks.find((b) => b.kind === "topic_practice")).toMatchObject({
      topic: "Organic Chemistry",
    });
    expect(plan.totalQuestions).toBeGreaterThan(0);
  });
});
