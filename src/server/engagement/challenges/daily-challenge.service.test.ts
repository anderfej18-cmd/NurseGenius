import { describe, expect, it, vi } from "vitest";
import { ConflictError, LimitReachedError, NotFoundError, ValidationError } from "@/lib/app-errors";
import type { ExamType } from "../../types";
import type { PoolQuestion, Quota } from "../../sessions/session.types";
import { DailyChallengeService, type ChallengeView } from "./daily-challenge.service";

const NOW = new Date("2026-10-10T15:00:00.000Z");
const USER = "user-1";

const question = (id: string, overrides: Partial<PoolQuestion> = {}): PoolQuestion => ({
  id,
  topic: "Pharmacology",
  difficulty: null,
  question_text: `Question ${id}?`,
  option_a: "a",
  option_b: "b",
  option_c: "c",
  option_d: "d",
  correct_answer: "A",
  ...overrides,
});
const poolOf = (count: number) => Array.from({ length: count }, (_, i) => question(`q${i + 1}`));
const quota = (overrides: Partial<Quota> = {}): Quota => ({
  tier: "novice",
  expiryDate: null,
  questionsToday: 0,
  lastQuestionDate: null,
  ...overrides,
});
const view = (overrides: Partial<ChallengeView> = {}): ChallengeView => ({
  id: "c1",
  challengeDate: "2026-10-10",
  examType: "RN",
  totalQuestions: 5,
  examId: null,
  examStatus: null,
  correct: null,
  scorePct: null,
  completedAt: null,
  ...overrides,
});

interface Setup {
  existing?: ChallengeView | null;
  afterCreate?: ChallengeView;
  pool?: PoolQuestion[];
  profile?: { quota: Quota; examPreference: string | null } | null;
}

function setup(options: Setup = {}) {
  let current = options.existing === undefined ? null : options.existing;
  const store = {
    getProfile: vi.fn(async (_user: string) =>
      options.profile === undefined ? { quota: quota(), examPreference: "RN" } : options.profile,
    ),
    getChallengeView: vi.fn(async (_user: string, _date: string) => current),
    createChallenge: vi.fn(
      async (_user: string, _date: string, _type: ExamType, _ids: readonly string[]) => {
        current = options.afterCreate ?? view();
        return current.id;
      },
    ),
    startChallengeSession: vi.fn(
      async (_user: string, _challenge: string, _minutes: number, _today: string) => "exam-1",
    ),
  };
  const pool = {
    listQuestionPool: vi.fn(async (_type: ExamType, _topic: null) => options.pool ?? poolOf(12)),
  };
  const selection = {
    pick: vi.fn(async (_user: string, candidates: readonly PoolQuestion[], count: number) =>
      candidates.slice(0, count),
    ),
  };
  const service = new DailyChallengeService({ store, pool, selection, clock: () => NOW });
  return { service, store, pool, selection };
}

describe("DailyChallengeService.today: creating the day's challenge", () => {
  it("chooses 5 questions with the adaptive selector and stores them for today", async () => {
    const { service, store, selection } = setup();
    const state = await service.today(USER, {});

    expect(selection.pick).toHaveBeenCalledWith(USER, expect.any(Array), 5);
    expect(store.createChallenge).toHaveBeenCalledWith(USER, "2026-10-10", "RN", [
      "q1",
      "q2",
      "q3",
      "q4",
      "q5",
    ]);
    expect(state).toMatchObject({
      id: "c1",
      status: "not_started",
      totalQuestions: 5,
      examId: null,
    });
  });

  it("only offers complete questions to the selector", async () => {
    const incomplete = question("bad", { option_c: "" });
    const { service, selection } = setup({ pool: [incomplete, ...poolOf(6)] });
    await service.today(USER, {});
    const offered = selection.pick.mock.calls[0][1] as PoolQuestion[];
    expect(offered.map((q) => q.id)).not.toContain("bad");
    expect(offered).toHaveLength(6);
  });

  it("makes a smaller challenge when the bank has fewer questions", async () => {
    const { service, store } = setup({ pool: poolOf(3) });
    await service.today(USER, {});
    expect(store.createChallenge.mock.calls[0][3]).toEqual(["q1", "q2", "q3"]);
  });

  it("refuses when there are no questions to choose from, and stores nothing", async () => {
    const { service, store } = setup({ pool: [] });
    await expect(service.today(USER, {})).rejects.toBeInstanceOf(ValidationError);
    expect(store.createChallenge).not.toHaveBeenCalled();
  });

  it("uses the exam type asked for, else the profile's", async () => {
    const asked = setup({ profile: { quota: quota(), examPreference: "RN" } });
    await asked.service.today(USER, { examType: "RM" });
    expect(asked.pool.listQuestionPool).toHaveBeenCalledWith("RM", null);

    const fromProfile = setup({ profile: { quota: quota(), examPreference: "RM" } });
    await fromProfile.service.today(USER, {});
    expect(fromProfile.pool.listQuestionPool).toHaveBeenCalledWith("RM", null);
  });

  it("asks the student to choose when the profile says Both, before reading any questions", async () => {
    const { service, pool } = setup({ profile: { quota: quota(), examPreference: "Both" } });
    await expect(service.today(USER, {})).rejects.toBeInstanceOf(ValidationError);
    expect(pool.listQuestionPool).not.toHaveBeenCalled();
  });

  it("reports a missing profile as not found", async () => {
    const { service } = setup({ profile: null });
    await expect(service.today(USER, {})).rejects.toBeInstanceOf(NotFoundError);
  });

  it("keys the challenge by the UTC date", async () => {
    const { service, store } = setup();
    await service.today(USER, {});
    expect(store.getChallengeView).toHaveBeenCalledWith(USER, "2026-10-10");
  });
});

describe("DailyChallengeService.today: an existing challenge", () => {
  it("returns it without choosing questions again", async () => {
    const { service, store, pool, selection } = setup({ existing: view({ id: "c9" }) });
    const state = await service.today(USER, {});
    expect(state.id).toBe("c9");
    expect(pool.listQuestionPool).not.toHaveBeenCalled();
    expect(selection.pick).not.toHaveBeenCalled();
    expect(store.createChallenge).not.toHaveBeenCalled();
  });

  it.each([
    [{ examId: null, examStatus: null }, "not_started"],
    [{ examId: "e1", examStatus: "in_progress" }, "in_progress"],
    [{ examId: "e1", examStatus: "completed" }, "completed"],
  ] as const)("reports %j as %s", async (fields, status) => {
    const { service } = setup({ existing: view(fields) });
    expect((await service.today(USER, {})).status).toBe(status);
  });

  it("reports the result of a finished challenge", async () => {
    const done = view({
      examId: "e1",
      examStatus: "completed",
      correct: 4,
      scorePct: 80,
      completedAt: new Date("2026-10-10T09:00:00.000Z"),
    });
    const state = await setup({ existing: done }).service.today(USER, {});
    expect(state.result).toEqual({
      correct: 4,
      total: 5,
      scorePct: 80,
      completedAt: new Date("2026-10-10T09:00:00.000Z"),
    });
  });

  it("has no result before it is finished", async () => {
    const state = await setup({
      existing: view({ examId: "e1", examStatus: "in_progress" }),
    }).service.today(USER, {});
    expect(state.result).toBeNull();
  });
});

describe("DailyChallengeService.start", () => {
  it("starts the challenge's session with a 10-minute limit and returns it", async () => {
    const { service, store } = setup({ existing: view() });
    expect(await service.start(USER, {})).toEqual({ examId: "exam-1", totalQuestions: 5 });
    expect(store.startChallengeSession).toHaveBeenCalledWith(USER, "c1", 10, "2026-10-10");
  });

  it("creates the challenge first when there is none yet", async () => {
    const { service, store } = setup();
    await service.start(USER, {});
    expect(store.createChallenge).toHaveBeenCalled();
    expect(store.startChallengeSession).toHaveBeenCalled();
  });

  it("takes the student back to a session already in progress, starting nothing new", async () => {
    const { service, store } = setup({
      existing: view({ examId: "e7", examStatus: "in_progress" }),
    });
    expect(await service.start(USER, {})).toEqual({ examId: "e7", totalQuestions: 5 });
    expect(store.startChallengeSession).not.toHaveBeenCalled();
  });

  it("refuses a challenge that is already finished", async () => {
    const { service, store } = setup({ existing: view({ examId: "e7", examStatus: "completed" }) });
    await expect(service.start(USER, {})).rejects.toBeInstanceOf(ConflictError);
    expect(store.startChallengeSession).not.toHaveBeenCalled();
  });

  it("applies the tier's daily allowance before starting anything", async () => {
    const used = quota({ questionsToday: 48, lastQuestionDate: "2026-10-10" });
    const { service, store } = setup({
      existing: view(),
      profile: { quota: used, examPreference: "RN" },
    });
    await expect(service.start(USER, {})).rejects.toBeInstanceOf(LimitReachedError);
    expect(store.startChallengeSession).not.toHaveBeenCalled();
  });

  it("reports a missing profile as not found", async () => {
    const { service } = setup({ existing: view(), profile: null });
    await expect(service.start(USER, {})).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("DailyChallengeService: whose data", () => {
  it("only ever asks about the given student", async () => {
    const { service, store } = setup({ existing: view() });
    await service.today("user-9", {});
    await service.start("user-9", {});
    for (const mock of Object.values(store)) {
      for (const call of mock.mock.calls) expect(call[0]).toBe("user-9");
    }
  });
});
