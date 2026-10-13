import { describe, expect, it, vi } from "vitest";
import {
  ConflictError,
  ForbiddenError,
  LimitReachedError,
  NotFoundError,
  ValidationError,
} from "../errors";
import {
  type Actor,
  type AttemptView,
  type CustomTestStore,
  type NewCustomTestQuestion,
  type NewLiveTest,
  CustomTestService,
} from "./custom-tests.service";

const NOW = new Date("2026-10-10T10:00:00.000Z");
const HASH = "a".repeat(64);
const KEY = "k".repeat(40);
const ADMIN = "admin-1";
const SUB: Actor = { id: ADMIN, central: false };
const CENTRAL: Actor = { id: "central-1", central: true };
const ID = "6f1c2f6e-0a53-4a54-9d3b-6a6f2b7a0c11";

const question = (overrides: Partial<NewCustomTestQuestion> = {}): NewCustomTestQuestion => ({
  question_text: "Which drug reverses opioid overdose?",
  option_a: "Naloxone",
  option_b: "Atropine",
  option_c: "Heparin",
  option_d: "Insulin",
  correct_answer: "A",
  rationale: null,
  ...overrides,
});
const newTest = (overrides: Partial<NewLiveTest> = {}): NewLiveTest => ({
  title: "  Mock 1 ",
  description: "",
  examType: "RN",
  sourceMode: "upload",
  durationMinutes: 30,
  startsAt: "2026-10-11T10:00:00.000Z",
  expiresAt: "2026-10-12T10:00:00.000Z",
  allocations: [],
  questions: [question()],
  ...overrides,
});
const view = (overrides: Partial<AttemptView> = {}): AttemptView => ({
  status: "in_progress",
  serverNow: NOW.toISOString(),
  startedAt: NOW.toISOString(),
  deadlineAt: "2026-10-10T10:30:00.000Z",
  test: { title: "Mock", description: null, examType: "RN", durationMinutes: 30 },
  email: "taker@example.com",
  linked: false,
  questions: [],
  result: null,
  ...overrides,
});
const summary = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  owner_id: ADMIN,
  owner_username: "ada",
  title: id,
  description: null,
  exam_type: "RN" as const,
  source_mode: "upload",
  duration_minutes: 30,
  starts_at: "2026-10-01T10:00:00.000Z",
  expires_at: "2026-10-09T10:00:00.000Z",
  status: "published",
  created_at: "2026-10-01T09:00:00.000Z",
  share_token: "token",
  state: "closed" as const,
  question_count: 5,
  participant_count: 4,
  pass_count: 3,
  average_score: 61.25,
  custom_unimported: 0,
  ...overrides,
});

function setup(
  overrides: Partial<CustomTestStore> = {},
  allowed = true,
  verified = "taker@example.com" as string | null,
) {
  const store = {
    createTest: vi.fn(async () => "test-1"),
    republish: vi.fn(async () => undefined),
    tests: vi.fn(async () => [] as Awaited<ReturnType<CustomTestStore["tests"]>>),
    closedAttempts: vi.fn(async () => [] as Awaited<ReturnType<CustomTestStore["closedAttempts"]>>),
    importQuestions: vi.fn(async () => ({ added: 4, skipped: 1 })),
    sharedState: vi.fn(async () => ({
      state: "live" as const,
      serverNow: NOW.toISOString(),
      test: null,
    })),
    startAttempt: vi.fn(async () => ({ attemptId: "att-1" })),
    attempt: vi.fn(async () => view()),
    saveAnswer: vi.fn(async () => undefined),
    submitAttempt: vi.fn(async () => ({ score: 80, correct: 4, total: 5, results: [] })),
    claimAttempt: vi.fn(async () => true),
    ...overrides,
  } satisfies CustomTestStore;
  const limiter = {
    consume: vi.fn(async (_b: string, _l: number, _w: number) => ({
      allowed,
      retryAfterSeconds: 90,
    })),
  };
  const digest = vi.fn(async (value: string) => `digest(${value})`);
  const newLink = vi.fn(async () => ({ token: "tok-123", tokenHash: HASH }));
  const verifiedEmailOf = vi.fn(async (_user: string) => verified);
  return {
    service: new CustomTestService({
      store,
      limiter,
      digest,
      newLink,
      verifiedEmailOf,
      clock: () => NOW,
    }),
    store,
    limiter,
    digest,
    newLink,
    verifiedEmailOf,
  };
}

describe("create", () => {
  it("makes the link on the server, stores a complete test as the admin with the title trimmed, and returns the token", async () => {
    const { service, store } = setup();
    expect(await service.create(ADMIN, newTest())).toEqual({ id: "test-1", token: "tok-123" });
    expect(store.createTest).toHaveBeenCalledWith(
      ADMIN,
      expect.objectContaining({ title: "Mock 1" }),
      { token: "tok-123", tokenHash: HASH },
    );
  });

  it("accepts a bank test described by subcategory counts", async () => {
    const { service, store } = setup();
    await service.create(
      ADMIN,
      newTest({
        sourceMode: "existing",
        questions: [],
        allocations: [
          { topic: "Pharmacology", count: 20 },
          { topic: "Maternal", count: 10 },
        ],
      }),
    );
    expect(store.createTest).toHaveBeenCalled();
  });

  it.each([
    ["a blank title", { title: "   " }],
    ["no questions", { questions: [] }],
    ["too many questions", { questions: Array.from({ length: 251 }, () => question()) }],
    ["a duration under 10 minutes", { durationMinutes: 5 }],
    ["a duration over 3 hours", { durationMinutes: 181 }],
    ["a fractional duration", { durationMinutes: 30.5 }],
    [
      "an end in the past",
      { startsAt: "2026-10-08T10:00:00.000Z", expiresAt: "2026-10-09T10:00:00.000Z" },
    ],
    [
      "an end before the start",
      { startsAt: "2026-10-12T10:00:00.000Z", expiresAt: "2026-10-11T10:00:00.000Z" },
    ],
    ["an unreadable start", { startsAt: "tomorrow" }],
    ["a window longer than 90 days", { expiresAt: "2027-03-01T10:00:00.000Z" }],
    ["an incomplete question", { questions: [question({ option_b: "  " })] }],
    ["an answer key outside A to D", { questions: [question({ correct_answer: "E" })] }],
    [
      "bank allocations over 250 in total",
      {
        sourceMode: "existing" as const,
        questions: [],
        allocations: [
          { topic: "A", count: 200 },
          { topic: "B", count: 51 },
        ],
      },
    ],
    [
      "a bank test with no subcategory",
      { sourceMode: "existing" as const, questions: [], allocations: [] },
    ],
    [
      "a subcategory chosen twice",
      {
        sourceMode: "existing" as const,
        questions: [],
        allocations: [
          { topic: "A", count: 1 },
          { topic: " A ", count: 1 },
        ],
      },
    ],
    [
      "a zero count",
      { sourceMode: "existing" as const, questions: [], allocations: [{ topic: "A", count: 0 }] },
    ],
  ])("rejects %s before storing anything", async (_name, overrides) => {
    const { service, store } = setup();
    await expect(
      service.create(ADMIN, newTest(overrides as Partial<NewLiveTest>)),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(store.createTest).not.toHaveBeenCalled();
  });
});

describe("republish", () => {
  const input = {
    testId: ID,
    startsAt: "2026-10-11T10:00:00.000Z",
    expiresAt: "2026-10-12T10:00:00.000Z",
    durationMinutes: 45,
  };

  it("validates the new schedule, makes a new link and returns its token", async () => {
    const { service, store } = setup();
    expect(await service.republish(SUB, input)).toEqual({ token: "tok-123" });
    expect(store.republish).toHaveBeenCalledWith(ADMIN, ID, input, {
      token: "tok-123",
      tokenHash: HASH,
    });
  });

  it("refuses a schedule that is in the past or a duration out of range, storing nothing", async () => {
    const { service, store } = setup();
    await expect(
      service.republish(SUB, { ...input, expiresAt: "2026-10-09T10:00:00.000Z" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(service.republish(SUB, { ...input, durationMinutes: 9 })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(store.republish).not.toHaveBeenCalled();
  });

  it("lets the database's not-found (a test the actor may not manage) through", async () => {
    const { service } = setup({
      republish: vi.fn(async () => {
        throw new NotFoundError("This test could not be found.");
      }),
    });
    await expect(service.republish(SUB, input)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("list", () => {
  it("returns each test with analytics and its ranked attempts, in two queries however many tests there are", async () => {
    const attempt = (id: string, test: string, score: number) => ({
      id,
      custom_test_id: test,
      email: `${id}@example.com`,
      score_pct: score,
      correct_count: 1,
      total_questions: 2,
      completed_at: null,
    });
    const { service, store } = setup({
      tests: vi.fn(async () => [
        summary("t1"),
        summary("t2", { participant_count: 0, pass_count: 0 }),
      ]),
      closedAttempts: vi.fn(async () => [
        attempt("a1", "t1", 90),
        attempt("a2", "t1", 40),
        attempt("a3", "t2", 70),
      ]),
    });
    const rows = await service.list(CENTRAL);
    expect(store.tests).toHaveBeenCalledTimes(1);
    expect(store.closedAttempts).toHaveBeenCalledWith("central-1", ["t1", "t2"]);
    expect(rows[0].analytics).toEqual({
      participant_count: 4,
      pass_count: 3,
      fail_count: 1,
      pass_pct: 75,
      average_score: 61.25,
    });
    expect(rows[0].attempts.map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(rows[1].analytics.pass_pct).toBe(0);
    expect(rows[1].attempts.map((a) => a.id)).toEqual(["a3"]);
  });

  it("shows the central admin full addresses and masks them for any other admin", async () => {
    const make = () =>
      setup({
        tests: vi.fn(async () => [summary("t1")]),
        closedAttempts: vi.fn(async () => [
          {
            id: "a1",
            custom_test_id: "t1",
            email: "ada.obi@example.com",
            score_pct: 80,
            correct_count: 4,
            total_questions: 5,
            completed_at: null,
          },
        ]),
      }).service;
    expect((await make().list(CENTRAL))[0].attempts[0].email).toBe("ada.obi@example.com");
    expect((await make().list(SUB))[0].attempts[0].email).toBe("a•••@example.com");
  });

  it("does not ask for attempts when there are no tests", async () => {
    const { service, store } = setup();
    expect(await service.list(SUB)).toEqual([]);
    expect(store.closedAttempts).not.toHaveBeenCalled();
  });
});

describe("importToBank", () => {
  it("imports under a trimmed subcategory and reports what was added and skipped", async () => {
    const { service, store } = setup();
    expect(
      await service.importToBank(SUB, { testId: ID, examType: "RM", topic: "  Maternal " }),
    ).toEqual({ added: 4, skipped: 1 });
    expect(store.importQuestions).toHaveBeenCalledWith(ADMIN, ID, "RM", "Maternal");
  });

  it("refuses a blank subcategory", async () => {
    const { service, store } = setup();
    await expect(
      service.importToBank(SUB, { testId: ID, examType: "RN", topic: "  " }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(store.importQuestions).not.toHaveBeenCalled();
  });
});

describe("getShared (public)", () => {
  it("says closed for a malformed link without touching the database or the limiter", async () => {
    const { service, store, limiter } = setup();
    expect(await service.getShared({ tokenHash: "nope" }, "1.2.3.4")).toMatchObject({
      state: "closed",
      test: null,
    });
    expect(store.sharedState).not.toHaveBeenCalled();
    expect(limiter.consume).not.toHaveBeenCalled();
  });

  it("limits views per address and then asks the database, whose clock decides upcoming, live or closed", async () => {
    const { service, store, limiter } = setup();
    expect((await service.getShared({ tokenHash: HASH }, "1.2.3.4")).state).toBe("live");
    expect(limiter.consume).toHaveBeenCalledWith("shared-view:ip:1.2.3.4", 60, 60);
    expect(store.sharedState).toHaveBeenCalledWith(HASH);
  });
});

describe("startShared (public)", () => {
  const input = { tokenHash: HASH, email: "  Taker@Example.com ", accessKey: KEY };

  it("starts an attempt for a lower-cased email, storing only the hash of the attempt key, and returns the attempt", async () => {
    const { service, store } = setup();
    const started = await service.startShared(input, "1.2.3.4");
    expect(store.startAttempt).toHaveBeenCalledWith(HASH, "taker@example.com", `digest(${KEY})`);
    expect(store.attempt).toHaveBeenCalledWith("att-1", `digest(${KEY})`);
    expect(started.attemptId).toBe("att-1");
    expect(started.attempt.status).toBe("in_progress");
  });

  it("limits attempts per caller address and per test and email, before looking anything up", async () => {
    const { service, limiter } = setup();
    await service.startShared(input, "1.2.3.4");
    const buckets = limiter.consume.mock.calls.map((call) => call[0]);
    expect(buckets).toEqual([
      "shared-start:ip:1.2.3.4",
      `shared-start:mail:${HASH}:taker@example.com`,
    ]);
  });

  it("refuses with a 429 that says when to retry, creating no attempt", async () => {
    const { service, store } = setup({}, false);
    const error = await service.startShared(input, "1.2.3.4").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LimitReachedError);
    expect(store.startAttempt).not.toHaveBeenCalled();
  });

  it.each([
    ["an invalid email", { email: "not-an-email" }],
    ["a link that is not a hash", { tokenHash: "short" }],
    ["a short attempt key", { accessKey: "short" }],
  ])("refuses %s", async (_name, overrides) => {
    const { service, store } = setup();
    await expect(service.startShared({ ...input, ...overrides }, "1.2.3.4")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(store.startAttempt).not.toHaveBeenCalled();
  });

  it("passes the database's refusals (not started yet, closed) through as typed errors", async () => {
    const early = setup({
      startAttempt: vi.fn(async () => {
        throw new ConflictError("This test has not started yet.");
      }),
    });
    await expect(early.service.startShared(input, "1.2.3.4")).rejects.toBeInstanceOf(ConflictError);
    const gone = setup({
      startAttempt: vi.fn(async () => {
        throw new NotFoundError("This test link has expired or does not exist.");
      }),
    });
    await expect(gone.service.startShared(input, "1.2.3.4")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("getAttempt, saveAnswer and submitShared (public)", () => {
  it("resumes an attempt by the hash of its key, limited per address", async () => {
    const { service, store, limiter } = setup();
    await service.getAttempt({ attemptId: ID, accessKey: KEY }, "1.2.3.4");
    expect(limiter.consume).toHaveBeenCalledWith("shared-resume:ip:1.2.3.4", 120, 60);
    expect(store.attempt).toHaveBeenCalledWith(ID, `digest(${KEY})`);
  });

  it("saves one answer and its flag for the attempt, limited per attempt", async () => {
    const { service, store, limiter } = setup();
    expect(
      await service.saveAnswer({
        attemptId: ID,
        accessKey: KEY,
        questionId: "q1",
        answer: "B",
        flagged: true,
      }),
    ).toEqual({ saved: true });
    expect(limiter.consume).toHaveBeenCalledWith(`shared-save:attempt:${ID}`, 3000, 3600);
    expect(store.saveAnswer).toHaveBeenCalledWith({
      attemptId: ID,
      accessHash: `digest(${KEY})`,
      questionId: "q1",
      answer: "B",
      flagged: true,
    });
  });

  it("stops saves over the limit without touching the database", async () => {
    const { service, store } = setup({}, false);
    await expect(
      service.saveAnswer({
        attemptId: ID,
        accessKey: KEY,
        questionId: "q1",
        answer: null,
        flagged: false,
      }),
    ).rejects.toBeInstanceOf(LimitReachedError);
    expect(store.saveAnswer).not.toHaveBeenCalled();
  });

  it("submits only the attempt, the key's hash and the answers; the score comes from the database", async () => {
    const { service, store } = setup();
    const answers = [{ question_id: "q1", user_answer: "A" }];
    expect(
      await service.submitShared({ attemptId: ID, accessKey: KEY, answers }, "1.2.3.4"),
    ).toMatchObject({ score: 80 });
    expect(store.submitAttempt).toHaveBeenCalledWith(ID, `digest(${KEY})`, answers);
  });

  it("limits submits per address and passes a closed-attempt refusal through", async () => {
    const limited = setup({}, false);
    await expect(
      limited.service.submitShared({ attemptId: ID, accessKey: KEY, answers: [] }, "1.2.3.4"),
    ).rejects.toBeInstanceOf(LimitReachedError);
    const closed = setup({
      submitAttempt: vi.fn(async () => {
        throw new ConflictError("This test has already been submitted.");
      }),
    });
    await expect(
      closed.service.submitShared({ attemptId: ID, accessKey: KEY, answers: [] }, "1.2.3.4"),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("claim", () => {
  it("links the attempt to the account when the key, a confirmed email and the test's email all agree", async () => {
    const { service, store, verifiedEmailOf } = setup();
    expect(await service.claim("user-1", { attemptId: ID, accessKey: KEY })).toEqual({
      claimed: true,
    });
    expect(verifiedEmailOf).toHaveBeenCalledWith("user-1");
    expect(store.claimAttempt).toHaveBeenCalledWith(ID, `digest(${KEY})`, "user-1");
  });

  it("compares the confirmed address without regard to case", async () => {
    const { service } = setup({}, true, "Taker@Example.COM");
    expect(await service.claim("user-1", { attemptId: ID, accessKey: KEY })).toEqual({
      claimed: true,
    });
  });

  it("is forbidden when the account's email has not been confirmed, however well it matches", async () => {
    const { service, store } = setup({}, true, null);
    await expect(service.claim("user-1", { attemptId: ID, accessKey: KEY })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(store.claimAttempt).not.toHaveBeenCalled();
  });

  it("is forbidden for an account whose confirmed email differs from the one used for the test", async () => {
    const { service, store } = setup({}, true, "someone.else@example.com");
    await expect(service.claim("user-1", { attemptId: ID, accessKey: KEY })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(store.claimAttempt).not.toHaveBeenCalled();
  });

  it("needs the attempt key: a wrong key is the database's not-found and nothing is linked", async () => {
    const { service, store } = setup({
      attempt: vi.fn(async () => {
        throw new NotFoundError("Attempt not found.");
      }),
    });
    await expect(service.claim("user-1", { attemptId: ID, accessKey: KEY })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(store.claimAttempt).not.toHaveBeenCalled();
  });

  it("reports an attempt already linked to another account as not claimed", async () => {
    const { service } = setup({ claimAttempt: vi.fn(async () => false) });
    expect(await service.claim("user-1", { attemptId: ID, accessKey: KEY })).toEqual({
      claimed: false,
    });
  });
});
