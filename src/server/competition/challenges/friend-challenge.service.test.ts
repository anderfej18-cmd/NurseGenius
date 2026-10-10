import { describe, expect, it, vi } from "vitest";
import { ConflictError, LimitReachedError, NotFoundError, ValidationError } from "@/lib/app-errors";
import type { PoolQuestion, Quota } from "../../sessions/session.types";
import type { ExamType } from "../../types";
import { FRIEND_CHALLENGE_CONFIG } from "./friend-challenge.config";
import { type ChallengeView } from "./friend-challenge";
import { FriendChallengeService } from "./friend-challenge.service";

const NOW = new Date("2026-10-10T12:00:00.000Z");
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
  role: "challenger",
  opponentUsername: "bob",
  examType: "RN",
  totalQuestions: 10,
  createdAt: new Date("2026-10-09T12:00:00.000Z"),
  expiresAt: new Date("2026-10-16T12:00:00.000Z"),
  declinedAt: null,
  myExamId: null,
  myExamStatus: null,
  myCorrect: null,
  myScorePct: null,
  myCompletedAt: null,
  theirExamStatus: null,
  theirCorrect: null,
  theirScorePct: null,
  theirCompletedAt: null,
  ...overrides,
});

interface Setup {
  pool?: PoolQuestion[];
  profile?: { quota: Quota; examPreference: string | null } | null;
  found?: ChallengeView | null;
  rows?: ChallengeView[];
  random?: () => number;
}

function setup(options: Setup = {}) {
  const store = {
    createChallenge: vi.fn(
      async (
        _user: string,
        _friendship: string,
        _type: ExamType,
        _ids: readonly string[],
        _expiresAt: Date,
        _maxOpen: number,
      ) => "c-new",
    ),
    declineChallenge: vi.fn(async (_user: string, _challenge: string) => undefined),
    startSession: vi.fn(
      async (_user: string, _challenge: string, _minutes: number, _today: string) => "exam-1",
    ),
    getView: vi.fn(async (_user: string, _challenge: string) =>
      options.found === undefined ? view() : options.found,
    ),
    listViews: vi.fn(async (_user: string, page: { limit: number; offset: number }) =>
      (options.rows ?? [view()]).slice(page.offset, page.offset + page.limit),
    ),
  };
  const profile = {
    getProfile: vi.fn(async (_user: string) =>
      options.profile === undefined ? { quota: quota(), examPreference: "RN" } : options.profile,
    ),
  };
  const pool = {
    listQuestionPool: vi.fn(async (_type: ExamType, _topic: null) => options.pool ?? poolOf(30)),
  };
  const service = new FriendChallengeService({
    store,
    profile,
    pool,
    clock: () => NOW,
    random: options.random ?? (() => 0),
  });
  return { service, store, profile, pool };
}

describe("FriendChallengeService.create", () => {
  it("sets a random question set for the friendship, as the signed-in student", async () => {
    const { service, store, pool } = setup();
    const result = await service.create(USER, { friendshipId: "f1" });

    expect(result).toEqual({ challengeId: "c-new" });
    expect(pool.listQuestionPool).toHaveBeenCalledWith("RN", null);
    const [user, friendship, examType, ids, expiresAt, maxOpen] =
      store.createChallenge.mock.calls[0];
    expect(user).toBe(USER);
    expect(friendship).toBe("f1");
    expect(examType).toBe("RN");
    expect(ids).toHaveLength(FRIEND_CHALLENGE_CONFIG.questions);
    expect(new Set(ids).size).toBe(ids.length);
    expect(expiresAt).toEqual(new Date("2026-10-17T12:00:00.000Z"));
    expect(maxOpen).toBe(FRIEND_CHALLENGE_CONFIG.maxOpen);
  });

  it("chooses with the random source it was given, so the choice is repeatable in tests", async () => {
    const first = setup({ random: () => 0 });
    const second = setup({ random: () => 0.999 });
    await first.service.create(USER, { friendshipId: "f1" });
    await second.service.create(USER, { friendshipId: "f1" });
    expect(first.store.createChallenge.mock.calls[0][3]).not.toEqual(
      second.store.createChallenge.mock.calls[0][3],
    );
  });

  it("uses only complete questions, and all of them when the bank is small", async () => {
    const pool = [question("q1"), question("q2", { option_b: "" }), question("q3")];
    const { service, store } = setup({ pool });
    await service.create(USER, { friendshipId: "f1" });
    expect([...store.createChallenge.mock.calls[0][3]].sort()).toEqual(["q1", "q3"]);
  });

  it("uses the exam type asked for over the profile's", async () => {
    const { service, store, pool } = setup();
    await service.create(USER, { friendshipId: "f1", examType: "RM" });
    expect(pool.listQuestionPool).toHaveBeenCalledWith("RM", null);
    expect(store.createChallenge.mock.calls[0][2]).toBe("RM");
  });

  it("asks the student to choose when the profile says Both and nothing was given", async () => {
    const { service, store } = setup({ profile: { quota: quota(), examPreference: "Both" } });
    await expect(service.create(USER, { friendshipId: "f1" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(store.createChallenge).not.toHaveBeenCalled();
  });

  it("stores nothing when the bank has no complete question", async () => {
    const { service, store } = setup({ pool: [question("q1", { option_a: "" })] });
    await expect(service.create(USER, { friendshipId: "f1" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(store.createChallenge).not.toHaveBeenCalled();
  });

  it("reports a missing profile", async () => {
    const { service } = setup({ profile: null });
    await expect(service.create(USER, { friendshipId: "f1" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("passes on what the database refuses (not a friend, too many waiting)", async () => {
    const { service, store } = setup();
    store.createChallenge.mockRejectedValueOnce(new NotFoundError("Friend request not found."));
    await expect(service.create(USER, { friendshipId: "f1" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("FriendChallengeService.decline", () => {
  it("declines as the signed-in student", async () => {
    const { service, store } = setup();
    expect(await service.decline(USER, { challengeId: "c1" })).toEqual({ declined: true });
    expect(store.declineChallenge).toHaveBeenCalledWith(USER, "c1");
  });
});

describe("FriendChallengeService.start", () => {
  it("starts the student's session with the configured minutes and today's date", async () => {
    const { service, store } = setup();
    const result = await service.start(USER, { challengeId: "c1" });
    expect(result).toEqual({ examId: "exam-1", totalQuestions: 10 });
    expect(store.startSession).toHaveBeenCalledWith(
      USER,
      "c1",
      FRIEND_CHALLENGE_CONFIG.minutes,
      "2026-10-10",
    );
  });

  it("does not know a challenge that is not the student's", async () => {
    const { service, store } = setup({ found: null });
    await expect(service.start(USER, { challengeId: "c1" })).rejects.toBeInstanceOf(NotFoundError);
    expect(store.startSession).not.toHaveBeenCalled();
  });

  it("returns the running session without checking the allowance again", async () => {
    const { service, store, profile } = setup({
      found: view({ myExamId: "exam-9", myExamStatus: "in_progress" }),
    });
    expect(await service.start(USER, { challengeId: "c1" })).toEqual({
      examId: "exam-9",
      totalQuestions: 10,
    });
    expect(store.startSession).not.toHaveBeenCalled();
    expect(profile.getProfile).not.toHaveBeenCalled();
  });

  it.each([
    [
      "finished by the student",
      view({ myExamId: "e", myExamStatus: "completed", myCorrect: 5, myScorePct: 50 }),
    ],
    ["declined", view({ declinedAt: new Date("2026-10-09T13:00:00.000Z") })],
    ["expired", view({ expiresAt: new Date("2026-10-10T11:00:00.000Z") })],
  ])("refuses a challenge that is %s", async (_label, found) => {
    const { service, store } = setup({ found });
    await expect(service.start(USER, { challengeId: "c1" })).rejects.toBeInstanceOf(ConflictError);
    expect(store.startSession).not.toHaveBeenCalled();
  });

  it("refuses when the tier's allowance for today is used up, and starts nothing", async () => {
    const { service, store } = setup({
      profile: {
        quota: quota({ questionsToday: 10_000, lastQuestionDate: "2026-10-10", tier: "novice" }),
        examPreference: "RN",
      },
    });
    await expect(service.start(USER, { challengeId: "c1" })).rejects.toBeInstanceOf(
      LimitReachedError,
    );
    expect(store.startSession).not.toHaveBeenCalled();
  });

  it("reports a missing profile", async () => {
    const { service } = setup({ profile: null });
    await expect(service.start(USER, { challengeId: "c1" })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("FriendChallengeService.get", () => {
  it("describes the challenge for the student, with its state", async () => {
    const { service } = setup({
      found: view({ myExamId: "e1", myExamStatus: "in_progress" }),
    });
    expect(await service.get(USER, { challengeId: "c1" })).toEqual({
      id: "c1",
      role: "challenger",
      opponentUsername: "bob",
      examType: "RN",
      totalQuestions: 10,
      createdAt: new Date("2026-10-09T12:00:00.000Z"),
      expiresAt: new Date("2026-10-16T12:00:00.000Z"),
      examId: "e1",
      state: { status: "in_progress" },
    });
  });

  it("does not know a challenge that is not the student's", async () => {
    const { service } = setup({ found: null });
    await expect(service.get(USER, { challengeId: "c1" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("shows the result once both have finished", async () => {
    const { service } = setup({
      found: view({
        myExamId: "e1",
        myExamStatus: "completed",
        myCorrect: 8,
        myScorePct: 80,
        theirExamStatus: "completed",
        theirCorrect: 6,
        theirScorePct: 60,
      }),
    });
    expect((await service.get(USER, { challengeId: "c1" })).state).toEqual({
      status: "completed",
      winner: "you",
      you: { correct: 8, scorePct: 80 },
      opponent: { correct: 6, scorePct: 60 },
    });
  });
});

describe("FriendChallengeService.list", () => {
  it("pages the student's challenges, asking for one row more than the page", async () => {
    const rows = [view({ id: "c1" }), view({ id: "c2" }), view({ id: "c3" })];
    const { service, store } = setup({ rows });
    const page = await service.list(USER, { limit: 2 });
    expect(store.listViews).toHaveBeenCalledWith(USER, { limit: 3, offset: 0 });
    expect(page.items.map((item) => item.id)).toEqual(["c1", "c2"]);
    expect(page.nextOffset).toBe(2);
  });

  it("is an empty page for a student with no challenges", async () => {
    const { service } = setup({ rows: [] });
    expect(await service.list(USER, {})).toEqual({ items: [], nextOffset: null });
  });
});
