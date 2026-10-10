import { describe, expect, it, vi } from "vitest";
import {
  ConflictError,
  ForbiddenError,
  LimitReachedError,
  NotFoundError,
  ValidationError,
} from "../errors";
import {
  type CustomTestStore,
  type NewCustomTestQuestion,
  CustomTestService,
} from "./custom-tests.service";

const NOW = new Date("2026-10-10T10:00:00.000Z");
const HASH = "a".repeat(64);
const KEY = "k".repeat(40);
const ADMIN = "admin-1";
const ID = "6f1c2f6e-0a53-4a54-9d3b-6a6f2b7a0c11";

const question = (overrides: Partial<NewCustomTestQuestion> = {}): NewCustomTestQuestion => ({
  question_text: "Which drug reverses opioid overdose?",
  option_a: "Naloxone",
  option_b: "Atropine",
  option_c: "Heparin",
  option_d: "Insulin",
  correct_answer: "A",
  rationale: null,
  source_question_id: null,
  source_kind: "custom",
  ...overrides,
});
const newTest = (overrides: Record<string, unknown> = {}) => ({
  title: "  Mock 1 ",
  description: "",
  examType: "RN" as const,
  sourceMode: "upload" as const,
  durationMinutes: 30,
  expiresAt: "2026-10-11T10:00:00.000Z",
  tokenHash: HASH,
  questions: [question()],
  ...overrides,
});

function setup(overrides: Partial<CustomTestStore> = {}, allowed = true) {
  const store = {
    createTest: vi.fn(async () => "test-1"),
    summaries: vi.fn(async () => [] as Awaited<ReturnType<CustomTestStore["summaries"]>>),
    completedAttempts: vi.fn(
      async () => [] as Awaited<ReturnType<CustomTestStore["completedAttempts"]>>,
    ),
    findPublished: vi.fn(
      async (_hash: string, _now: Date) =>
        ({
          id: "test-1",
          title: "Mock",
          description: null,
          examType: "RN" as const,
          durationMinutes: 30,
          expiresAt: "2026-10-11T10:00:00.000Z",
        }) as Awaited<ReturnType<CustomTestStore["findPublished"]>>,
    ),
    sharedQuestions: vi.fn(async () => [
      {
        id: "q1",
        position: 0,
        question_text: "Q",
        option_a: "a",
        option_b: "b",
        option_c: "c",
        option_d: "d",
      },
    ]),
    countQuestions: vi.fn(async () => 5),
    insertAttempt: vi.fn(async () => ({ attemptId: "att-1", startedAt: NOW.toISOString() })),
    submitAttempt: vi.fn(async () => ({ score: 80, correct: 4, total: 5, results: [] })),
    findAttempt: vi.fn(async () => ({
      id: "att-1",
      email: "taker@example.com",
      userId: null as string | null,
    })),
    claimAttempt: vi.fn(async () => true),
    republish: vi.fn(async () => true),
    importToBank: vi.fn(async () => 5),
    ...overrides,
  } satisfies CustomTestStore;
  const limiter = {
    consume: vi.fn(async (_b: string, _l: number, _w: number) => ({
      allowed,
      retryAfterSeconds: 90,
    })),
  };
  const digest = vi.fn(async (value: string) => `digest(${value})`);
  return {
    service: new CustomTestService({ store, limiter, digest, clock: () => NOW }),
    store,
    limiter,
    digest,
  };
}

describe("create", () => {
  it("stores a complete test as the admin, with the title trimmed", async () => {
    const { service, store } = setup();
    expect(await service.create(ADMIN, newTest())).toEqual({ id: "test-1" });
    expect(store.createTest).toHaveBeenCalledWith(
      ADMIN,
      expect.objectContaining({ title: "Mock 1", tokenHash: HASH }),
    );
  });

  it.each([
    ["a blank title", { title: "   " }],
    ["no questions", { questions: [] }],
    ["too many questions", { questions: Array.from({ length: 251 }, () => question()) }],
    ["a link token that is not a SHA-256 hash", { tokenHash: "short" }],
    ["a duration under 10 minutes", { durationMinutes: 5 }],
    ["a duration over 3 hours", { durationMinutes: 181 }],
    ["an expiry in the past", { expiresAt: "2026-10-09T10:00:00.000Z" }],
    ["an unreadable expiry", { expiresAt: "tomorrow" }],
    ["an incomplete question", { questions: [question({ option_b: " " })] }],
    ["an answer outside A to D", { questions: [question({ correct_answer: "E" })] }],
  ])("refuses %s, and stores nothing", async (_label, change) => {
    const { service, store } = setup();
    await expect(service.create(ADMIN, newTest(change))).rejects.toBeInstanceOf(ValidationError);
    expect(store.createTest).not.toHaveBeenCalled();
  });
});

describe("list", () => {
  it("returns each test with its counts and its best attempts, from three queries however many tests there are", async () => {
    const summary = (id: string) => ({
      id,
      title: id,
      description: null,
      exam_type: "RN" as const,
      source_mode: "upload",
      duration_minutes: 30,
      expires_at: "x",
      status: "published",
      created_at: "y",
      question_count: 5,
      participant_count: 2,
      pass_count: 1,
      average_score: 60,
    });
    const attempt = (testId: string, score: number) => ({
      id: `${testId}-${score}`,
      custom_test_id: testId,
      email: "a@b.co",
      score_pct: score,
      correct_count: 1,
      total_questions: 5,
      completed_at: "z",
    });
    const { service, store } = setup({
      summaries: vi.fn(async () => [summary("t1"), summary("t2")]),
      completedAttempts: vi.fn(async () => [
        attempt("t1", 90),
        attempt("t2", 40),
        attempt("t1", 30),
      ]),
    });
    const tests = await service.list(ADMIN);
    expect(tests.map((t) => t.attempts.map((a) => a.score_pct))).toEqual([[90, 30], [40]]);
    expect(tests[0].analytics).toEqual({
      participant_count: 2,
      pass_count: 1,
      fail_count: 1,
      pass_pct: 50,
      average_score: 60,
    });
    expect(store.summaries).toHaveBeenCalledTimes(1);
    expect(store.completedAttempts).toHaveBeenCalledTimes(1);
  });
});

describe("getShared (public)", () => {
  it("says expired for a malformed or unknown link without touching the question table", async () => {
    const { service, store } = setup({ findPublished: vi.fn(async () => null) });
    expect(await service.getShared({ tokenHash: "nope" }, "1.1.1.1")).toEqual({
      expired: true,
      test: null,
      questions: [],
    });
    expect(await service.getShared({ tokenHash: HASH }, "1.1.1.1")).toEqual({
      expired: true,
      test: null,
      questions: [],
    });
    expect(store.sharedQuestions).not.toHaveBeenCalled();
  });

  it("returns the questions without any answer key", async () => {
    const { service } = setup();
    const result = await service.getShared({ tokenHash: HASH }, "1.1.1.1");
    expect(result.expired).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/correct_answer|rationale/);
  });
});

describe("startShared (public)", () => {
  const input = { tokenHash: HASH, email: " Taker@Example.com ", accessKey: KEY };

  it("creates an attempt for a lower-cased email, storing only the hash of the attempt key", async () => {
    const { service, store } = setup();
    const result = await service.startShared(input, "203.0.113.9");
    expect(store.insertAttempt).toHaveBeenCalledWith({
      testId: "test-1",
      email: "taker@example.com",
      accessHash: `digest(${KEY})`,
      totalQuestions: 5,
    });
    expect(JSON.stringify(vi.mocked(store.insertAttempt).mock.calls)).not.toContain(`"${KEY}"`);
    expect(result).toMatchObject({
      attemptId: "att-1",
      durationMinutes: 30,
      totalQuestions: 5,
      accessKey: KEY,
    });
  });

  it("limits attempts per caller address and per test and email, before looking anything up", async () => {
    const { service, limiter, store } = setup();
    await service.startShared(input, "203.0.113.9");
    expect(limiter.consume.mock.calls.map(([bucket]) => bucket)).toEqual(
      expect.arrayContaining([
        "shared-start:ip:203.0.113.9",
        `shared-start:mail:${HASH}:taker@example.com`,
      ]),
    );
    expect(limiter.consume.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(store.findPublished).mock.invocationCallOrder[0],
    );
  });

  it("refuses with a 429 that says when to retry, creating no attempt", async () => {
    const { service, store } = setup({}, false);
    const error = await service.startShared(input, "203.0.113.9").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LimitReachedError);
    expect((error as Error).message).toMatch(/2 minutes/);
    expect(store.insertAttempt).not.toHaveBeenCalled();
  });

  it.each([
    ["an invalid email", { email: "not-an-email" }],
    ["a malformed link", { tokenHash: "short" }],
    ["a short attempt key", { accessKey: "short" }],
  ])("refuses %s", async (_label, change) => {
    const { service, store } = setup();
    await expect(service.startShared({ ...input, ...change }, "1.1.1.1")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(store.insertAttempt).not.toHaveBeenCalled();
  });

  it("is not found for an expired link, and refuses a test with no questions", async () => {
    const gone = setup({ findPublished: vi.fn(async () => null) });
    await expect(gone.service.startShared(input, "1.1.1.1")).rejects.toBeInstanceOf(NotFoundError);
    const empty = setup({ countQuestions: vi.fn(async () => 0) });
    await expect(empty.service.startShared(input, "1.1.1.1")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe("submitShared (public)", () => {
  const input = { attemptId: ID, accessKey: KEY, answers: [{ question_id: ID, user_answer: "A" }] };

  it("sends only the attempt, the key's hash and the answers; the score comes from the database", async () => {
    const { service, store } = setup();
    expect(await service.submitShared(input, "1.1.1.1")).toMatchObject({ score: 80, correct: 4 });
    expect(store.submitAttempt).toHaveBeenCalledWith(ID, `digest(${KEY})`, input.answers);
  });

  it("is limited per address, and refuses an empty answer list", async () => {
    const limited = setup({}, false);
    await expect(limited.service.submitShared(input, "1.1.1.1")).rejects.toBeInstanceOf(
      LimitReachedError,
    );
    await expect(
      setup().service.submitShared({ ...input, answers: [] }, "1.1.1.1"),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("passes a database refusal (closed attempt) through as the typed error", async () => {
    const { service } = setup({
      submitAttempt: vi.fn(async () => {
        throw new ConflictError("This test has already been submitted.");
      }),
    });
    await expect(service.submitShared(input, "1.1.1.1")).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("claim", () => {
  const input = { attemptId: ID, accessKey: KEY };

  it("links an attempt to the account that used the same email", async () => {
    const { service, store } = setup();
    expect(await service.claim("user-1", "Taker@Example.com", input)).toEqual({ claimed: true });
    expect(store.findAttempt).toHaveBeenCalledWith(ID, `digest(${KEY})`);
    expect(store.claimAttempt).toHaveBeenCalledWith(ID, `digest(${KEY})`, "user-1");
  });

  it("is not found for a wrong key, and forbidden for another email or another account", async () => {
    await expect(
      setup({ findAttempt: vi.fn(async () => null) }).service.claim(
        "u",
        "taker@example.com",
        input,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(setup().service.claim("u", "someone@else.com", input)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(setup().service.claim("u", undefined, input)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    const owned = setup({
      findAttempt: vi.fn(async () => ({
        id: "att-1",
        email: "taker@example.com",
        userId: "someone-else",
      })),
    });
    await expect(owned.service.claim("u", "taker@example.com", input)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("republish and import", () => {
  it("republishes with a future expiry, and is not found for a test the admin does not own", async () => {
    const { service, store } = setup();
    await service.republish(ADMIN, {
      testId: ID,
      tokenHash: HASH,
      expiresAt: "2026-10-12T00:00:00.000Z",
    });
    expect(store.republish).toHaveBeenCalledWith(ADMIN, ID, HASH, "2026-10-12T00:00:00.000Z");
    await expect(
      service.republish(ADMIN, {
        testId: ID,
        tokenHash: HASH,
        expiresAt: "2026-10-01T00:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      setup({ republish: vi.fn(async () => false) }).service.republish(ADMIN, {
        testId: ID,
        tokenHash: HASH,
        expiresAt: "2026-10-12T00:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("imports into the bank under a trimmed topic and reports how many", async () => {
    const { service, store } = setup();
    expect(await service.importToBank(ADMIN, { testId: ID, topic: " Pharmacology " })).toEqual({
      count: 5,
    });
    expect(store.importToBank).toHaveBeenCalledWith(ADMIN, ID, "Pharmacology");
    await expect(service.importToBank(ADMIN, { testId: ID, topic: "  " })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
