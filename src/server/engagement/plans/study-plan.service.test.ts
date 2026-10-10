import { describe, expect, it, vi } from "vitest";
import { NotFoundError, ValidationError } from "@/lib/app-errors";
import type { AttemptRecord } from "../../intelligence/attempt.types";
import { MasteryService } from "../../intelligence/mastery/mastery.service";
import { TimeAnalyticsService } from "../../intelligence/time/time-analytics.service";
import type { ReadinessProfile } from "../../intelligence/readiness/readiness.service";
import { generateStudyPlan } from "./study-plan";
import { type StoredStudyPlan, StudyPlanService } from "./study-plan.service";

const NOW = new Date("2026-10-01T10:00:00.000Z");
const USER = "user-1";
const EXAM_DATE = "2026-10-29";
const BANK = { Fundamentals: 100, Maternal: 100, Pharmacology: 100 };

let counter = 0;
const attempt = (overrides: Partial<AttemptRecord> = {}): AttemptRecord => {
  counter += 1;
  return {
    questionId: `q${counter}`,
    topic: "Pharmacology",
    examType: "RN",
    sessionId: `s${Math.ceil(counter / 10)}`,
    correct: true,
    answeredAt: new Date("2026-09-20T09:00:00.000Z"),
    difficulty: null,
    confidence: null,
    timeSpentMs: null,
    sessionType: "topic_practice",
    ...overrides,
  };
};
const many = (count: number, overrides: Partial<AttemptRecord> = {}) =>
  Array.from({ length: count }, () => attempt(overrides));

interface Setup {
  profile?: ReadinessProfile | null;
  attempts?: AttemptRecord[];
  bank?: Record<string, number>;
  stored?: StoredStudyPlan | null;
  setExamDateFails?: boolean;
}

function setup(options: Setup = {}) {
  const profile =
    options.profile === undefined ? { examDate: EXAM_DATE, examPreference: "RN" } : options.profile;
  const store = {
    getPlan: vi.fn(async (_user: string) => options.stored ?? null),
    savePlan: vi.fn(async (_user: string, _plan: StoredStudyPlan) => undefined),
    setExamDate: vi.fn(async (_user: string, _date: string) => undefined),
  };
  const catalog = { topicCounts: vi.fn(async (_type: string) => options.bank ?? BANK) };
  const history = { load: vi.fn(async (_user: string) => options.attempts ?? []) };
  const service = new StudyPlanService({
    profile: { getReadinessProfile: async () => profile },
    store,
    history,
    mastery: new MasteryService(),
    time: new TimeAnalyticsService(),
    catalog,
    clock: () => NOW,
  });
  return { service, store, catalog };
}

const saved = (store: ReturnType<typeof setup>["store"]): StoredStudyPlan =>
  store.savePlan.mock.calls[0][1];
const plannedTopics = (plan: StoredStudyPlan) =>
  new Set(plan.draft.weeks.flatMap((week) => week.items.map((item) => item.topic)));

describe("StudyPlanService.create", () => {
  it("plans from the topics in the bank, with the defaults, and stores the plan", async () => {
    const { service, store, catalog } = setup();
    const view = await service.create(USER, {});

    expect(catalog.topicCounts).toHaveBeenCalledWith("RN");
    const plan = saved(store);
    expect(store.savePlan).toHaveBeenCalledTimes(1);
    expect(store.savePlan.mock.calls[0][0]).toBe(USER);
    expect(plan).toMatchObject({
      examType: "RN",
      settings: { dailyMinutes: 30, daysPerWeek: 5, targetScore: 80 },
      createdAt: NOW,
    });
    expect(plan.draft.startsOn).toBe("2026-10-01");
    expect(plan.draft.examDate).toBe(EXAM_DATE);
    for (const topic of plannedTopics(plan)) {
      if (topic !== null) expect(Object.keys(BANK)).toContain(topic);
    }
    expect(view.plan).toEqual(plan.draft);
    expect(view.settings).toEqual(plan.settings);
    expect(view.examDateChanged).toBe(false);
  });

  it("uses the settings the student gives", async () => {
    const { service, store } = setup();
    await service.create(USER, { dailyMinutes: 60, daysPerWeek: 3, targetScore: 90 });
    expect(saved(store).settings).toEqual({ dailyMinutes: 60, daysPerWeek: 3, targetScore: 90 });
  });

  it("is the same plan generateStudyPlan makes from the same facts", async () => {
    const { service, store } = setup();
    await service.create(USER, {});
    expect(saved(store).draft).toEqual(
      generateStudyPlan({
        today: "2026-10-01",
        examDate: EXAM_DATE,
        dailyMinutes: 30,
        daysPerWeek: 5,
        targetScore: 80,
        secondsPerQuestion: null,
        topics: Object.entries(BANK).map(([topic, questionCount]) => ({
          topic,
          questionCount,
          mastery: null,
        })),
      }),
    );
  });

  it("starts with the weakest topic the student has shown", async () => {
    const attempts = [
      ...many(30, { topic: "Pharmacology", correct: false }),
      ...many(30, { topic: "Fundamentals", correct: true }),
    ];
    const { service, store } = setup({ attempts });
    await service.create(USER, {});
    expect(saved(store).draft.weeks[0].items[0].topic).toBe("Pharmacology");
  });

  it("sizes the days by the student's own pace in this exam", async () => {
    // 40 timed answers at 90 s: 30 minutes a day is 20 questions, not the default 30.
    const { service, store } = setup({ attempts: many(40, { timeSpentMs: 90_000 }) });
    await service.create(USER, {});
    expect(saved(store).draft.questionsPerDay).toBe(20);
  });

  it("ignores answers from the other exam", async () => {
    const { service, store } = setup({
      attempts: many(40, { examType: "RM", timeSpentMs: 90_000, correct: false }),
    });
    await service.create(USER, {});
    expect(saved(store).draft.questionsPerDay).toBe(30);
  });

  it("uses the exam type asked for over the profile's", async () => {
    const { service, store, catalog } = setup();
    await service.create(USER, { examType: "RM" });
    expect(catalog.topicCounts).toHaveBeenCalledWith("RM");
    expect(saved(store).examType).toBe("RM");
  });

  it("reports progress on the new plan from what was already answered today", async () => {
    const attempts = many(5, {
      topic: "Pharmacology",
      answeredAt: new Date("2026-10-01T08:00:00.000Z"),
    });
    const { service } = setup({ attempts, bank: { Pharmacology: 100 } });
    const view = await service.create(USER, {});
    expect(view.progress.questionsDone).toBe(5);
    expect(view.progress.weeks).toHaveLength(view.plan.weeks.length);
  });

  it("asks for an exam date when the profile has none, and stores nothing", async () => {
    const { service, store } = setup({ profile: { examDate: null, examPreference: "RN" } });
    await expect(service.create(USER, {})).rejects.toBeInstanceOf(ValidationError);
    expect(store.savePlan).not.toHaveBeenCalled();
  });

  it("refuses an exam date that is not in the future", async () => {
    const { service, store } = setup({ profile: { examDate: "2026-10-01", examPreference: "RN" } });
    await expect(service.create(USER, {})).rejects.toBeInstanceOf(ValidationError);
    expect(store.savePlan).not.toHaveBeenCalled();
  });

  it("refuses settings outside the allowed range", async () => {
    const { service, store } = setup();
    await expect(service.create(USER, { dailyMinutes: 5 })).rejects.toBeInstanceOf(ValidationError);
    expect(store.savePlan).not.toHaveBeenCalled();
  });

  it("refuses a bank with no questions", async () => {
    const { service, store } = setup({ bank: {} });
    await expect(service.create(USER, {})).rejects.toBeInstanceOf(ValidationError);
    expect(store.savePlan).not.toHaveBeenCalled();
  });

  it("asks the student to choose when the profile says Both and nothing was given", async () => {
    const { service, store } = setup({ profile: { examDate: EXAM_DATE, examPreference: "Both" } });
    await expect(service.create(USER, {})).rejects.toBeInstanceOf(ValidationError);
    expect(store.savePlan).not.toHaveBeenCalled();
  });

  it("reports a missing profile", async () => {
    const { service } = setup({ profile: null });
    await expect(service.create(USER, {})).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("StudyPlanService.get", () => {
  const stored = (overrides: Partial<StoredStudyPlan> = {}): StoredStudyPlan => ({
    examType: "RN",
    settings: { dailyMinutes: 30, daysPerWeek: 5, targetScore: 80 },
    createdAt: new Date("2026-09-24T10:00:00.000Z"),
    draft: generateStudyPlan({
      today: "2026-09-24",
      examDate: EXAM_DATE,
      dailyMinutes: 30,
      daysPerWeek: 5,
      targetScore: 80,
      secondsPerQuestion: null,
      topics: [{ topic: "Pharmacology", questionCount: 100, mastery: null }],
    }),
    ...overrides,
  });

  it("is null for a student with no plan", async () => {
    const { service } = setup();
    expect(await service.get(USER)).toBeNull();
  });

  it("returns the stored plan with progress from the answers since it started", async () => {
    const plan = stored();
    const attempts = [
      ...many(12, { answeredAt: new Date("2026-09-25T09:00:00.000Z") }),
      // before the plan started: not part of it
      ...many(50, { answeredAt: new Date("2026-09-10T09:00:00.000Z") }),
      // another exam: not part of it
      ...many(50, { examType: "RM", answeredAt: new Date("2026-09-25T09:00:00.000Z") }),
    ];
    const { service } = setup({ stored: plan, attempts });
    const view = await service.get(USER);

    expect(view).not.toBeNull();
    expect(view?.plan).toEqual(plan.draft);
    expect(view?.createdAt).toEqual(plan.createdAt);
    expect(view?.progress.questionsDone).toBe(12);
    expect(view?.progress.weeks[0].items[0].done).toBe(12);
  });

  it("tells the student when their exam date no longer matches the plan", async () => {
    const { service } = setup({
      stored: stored(),
      profile: { examDate: "2026-11-15", examPreference: "RN" },
    });
    expect((await service.get(USER))?.examDateChanged).toBe(true);
  });

  it("does not flag a plan whose exam date still matches", async () => {
    const { service } = setup({ stored: stored() });
    expect((await service.get(USER))?.examDateChanged).toBe(false);
  });

  it("flags a plan when the student has since removed their exam date", async () => {
    const { service } = setup({
      stored: stored(),
      profile: { examDate: null, examPreference: "RN" },
    });
    expect((await service.get(USER))?.examDateChanged).toBe(true);
  });

  it("reports a missing profile", async () => {
    const { service } = setup({ stored: stored(), profile: null });
    await expect(service.get(USER)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("StudyPlanService.create: a new plan keeps what was done", () => {
  // An earlier plan made on 09-24 covers weeks 09-24..09-30 and 10-01..10-07 and so on.
  const earlier = (): StoredStudyPlan => ({
    examType: "RN",
    settings: { dailyMinutes: 30, daysPerWeek: 5, targetScore: 80 },
    createdAt: new Date("2026-09-24T10:00:00.000Z"),
    draft: generateStudyPlan({
      today: "2026-09-24",
      examDate: "2026-10-29",
      dailyMinutes: 30,
      daysPerWeek: 5,
      targetScore: 80,
      secondsPerQuestion: null,
      topics: [{ topic: "Pharmacology", questionCount: 100, mastery: null }],
    }),
  });

  it("keeps the weeks already begun, cut at yesterday, and plans the rest from today", async () => {
    const { service, store } = setup({ stored: earlier(), bank: { Pharmacology: 100 } });
    await service.create(USER, {});
    const plan = saved(store);

    // Earlier plan: week 0 = 09-24..09-30 (finished), week 1 = 10-01..10-07 (begins today).
    expect(plan.draft.startsOn).toBe("2026-09-24");
    expect(plan.draft.weeks[0]).toMatchObject({
      index: 0,
      startsOn: "2026-09-24",
      endsOn: "2026-09-30",
    });
    expect(plan.draft.weeks.map((week) => week.index)).toEqual(plan.draft.weeks.map((_, i) => i));
    const fresh = plan.draft.weeks[1];
    expect(fresh.startsOn).toBe("2026-10-01");
    expect(plan.draft.weeks.at(-1)?.endsOn).toBe("2026-10-28");
    expect(plan.draft.weeks.at(-1)?.kind).toBe("final");
  });

  it("counts answers given in the weeks kept, so completed work is not lost", async () => {
    const attempts = many(20, {
      topic: "Pharmacology",
      answeredAt: new Date("2026-09-26T09:00:00.000Z"),
    });
    const { service } = setup({ stored: earlier(), attempts, bank: { Pharmacology: 100 } });
    const view = await service.create(USER, {});
    expect(view.progress.questionsDone).toBe(20);
    expect(view.progress.weeks[0].done).toBe(20);
  });

  it("keeps only the part of a week that has passed when the plan is made part-way through it", async () => {
    // Made on 10-03: the week 10-01..10-07 has begun, so it is kept up to 10-02.
    const early = { ...earlier() };
    const { service, store } = setup({
      stored: early,
      bank: { Pharmacology: 100 },
    });
    // Move the clock by creating with a service whose clock is 10-03.
    const later = new (service.constructor as typeof StudyPlanService)({
      profile: { getReadinessProfile: async () => ({ examDate: EXAM_DATE, examPreference: "RN" }) },
      store,
      history: { load: async () => [] },
      mastery: new MasteryService(),
      time: new TimeAnalyticsService(),
      catalog: { topicCounts: async () => ({ Pharmacology: 100 }) },
      clock: () => new Date("2026-10-03T10:00:00.000Z"),
    });
    await later.create(USER, {});
    const weeks = saved(store).draft.weeks;
    expect(weeks[1]).toMatchObject({ startsOn: "2026-10-01", endsOn: "2026-10-02" });
    expect(weeks[2].startsOn).toBe("2026-10-03");
  });

  it("starts afresh when the earlier plan was for the other exam", async () => {
    const other = { ...earlier(), examType: "RM" as const };
    const { service, store } = setup({ stored: other });
    await service.create(USER, { examType: "RN" });
    expect(saved(store).draft.startsOn).toBe("2026-10-01");
    expect(saved(store).draft.weeks[0].index).toBe(0);
  });

  it("starts afresh when the earlier plan began today, so no week of it has passed", async () => {
    const today = {
      ...earlier(),
      draft: generateStudyPlan({
        today: "2026-10-01",
        examDate: "2026-10-29",
        dailyMinutes: 30,
        daysPerWeek: 5,
        targetScore: 80,
        secondsPerQuestion: null,
        topics: [{ topic: "Pharmacology", questionCount: 100, mastery: null }],
      }),
    };
    const { service, store } = setup({ stored: today, bank: { Pharmacology: 100 } });
    await service.create(USER, {});
    expect(saved(store).draft.startsOn).toBe("2026-10-01");
    expect(saved(store).draft.weeks[0].index).toBe(0);
  });

  it("recomputes the summary over all the weeks", async () => {
    const { service, store } = setup({ stored: earlier(), bank: { Pharmacology: 100 } });
    await service.create(USER, {});
    const plan = saved(store);
    const total = plan.draft.weeks
      .flatMap((week) => week.items)
      .reduce((n, item) => n + item.questions, 0);
    expect(plan.draft.summary.totalQuestions).toBe(total);
  });
});

describe("StudyPlanService.get: when the plan needs attention", () => {
  const plan = (): StoredStudyPlan => ({
    examType: "RN",
    settings: { dailyMinutes: 30, daysPerWeek: 5, targetScore: 80 },
    createdAt: new Date("2026-09-24T10:00:00.000Z"),
    draft: generateStudyPlan({
      today: "2026-09-24",
      examDate: EXAM_DATE,
      dailyMinutes: 30,
      daysPerWeek: 5,
      targetScore: 80,
      secondsPerQuestion: null,
      topics: [{ topic: "Pharmacology", questionCount: 100, mastery: null }],
    }),
  });

  it("asks for an update when the exam date changed, ahead of any other reason", async () => {
    const { service } = setup({
      stored: plan(),
      profile: { examDate: "2026-11-15", examPreference: "RN" },
    });
    expect((await service.get(USER))?.attention).toBe("exam_date_changed");
  });

  it("asks for an update when the student has fallen behind the plan", async () => {
    const { service } = setup({ stored: plan(), attempts: [] });
    expect((await service.get(USER))?.attention).toBe("behind");
  });

  it("asks for nothing when the plan is on track", async () => {
    const attempts = many(120, {
      topic: "Pharmacology",
      answeredAt: new Date("2026-09-26T09:00:00.000Z"),
    });
    const { service } = setup({ stored: plan(), attempts });
    expect((await service.get(USER))?.attention).toBeNull();
  });
});

describe("StudyPlanService.setExamDate", () => {
  it("saves a future date for the named student", async () => {
    const { service, store } = setup();
    await service.setExamDate(USER, "2026-12-01");
    expect(store.setExamDate).toHaveBeenCalledWith(USER, "2026-12-01");
  });

  it.each([
    ["today", "2026-10-01"],
    ["a past date", "2026-09-01"],
    ["a date more than two years away", "2029-01-01"],
    ["not a date", "soon"],
    ["an impossible date", "2026-02-31"],
  ])("refuses %s and saves nothing", async (_label, date) => {
    const { service, store } = setup();
    await expect(service.setExamDate(USER, date)).rejects.toBeInstanceOf(ValidationError);
    expect(store.setExamDate).not.toHaveBeenCalled();
  });
});
