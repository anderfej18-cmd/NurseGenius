import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "../errors";

const store = vi.hoisted(() => ({
  createTest: vi.fn(async () => "t1"),
  republish: vi.fn(async () => undefined),
  tests: vi.fn(async () => [] as unknown[]),
  closedAttempts: vi.fn(async () => [] as unknown[]),
  importQuestions: vi.fn(async () => ({ added: 1, skipped: 0 })),
  sharedState: vi.fn(async () => ({ state: "live", serverNow: "x", test: null })),
  startAttempt: vi.fn(),
  attempt: vi.fn(),
  saveAnswer: vi.fn(async () => undefined),
  submitAttempt: vi.fn(),
  claimAttempt: vi.fn(),
}));
const roles = vi.hoisted(() => ({ central: false }));
const confirmedEmail = vi.hoisted(() => ({ value: "taker@example.com" as string | null }));
const consume = vi.hoisted(() => vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })));
const assertAdmin = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        getUserById: async () => ({
          error: null,
          data: {
            user: {
              email: "taker@example.com",
              email_confirmed_at: confirmedEmail.value === null ? null : "2026-01-01",
            },
          },
        }),
      },
    },
  },
}));
vi.mock("../access/admin-access.server", () => ({ assertAdmin }));
vi.mock("./custom-tests.repository.server", () => ({
  SupabaseCustomTestStore: class {
    constructor() {
      return store;
    }
  },
}));
vi.mock("../rate-limit/rate-limiter.repository.server", () => ({
  SupabaseRateLimiter: class {
    constructor() {
      return { consume };
    }
  },
}));

import { customTestController } from "./custom-tests.controller.server";

const caller = {
  userId: "user-1",
  supabase: { rpc: async () => ({ data: roles.central, error: null }) } as never,
};
const HASH = "a".repeat(64);
const KEY = "k".repeat(40);
const ID = "6f1c2f6e-0a53-4a54-9d3b-6a6f2b7a0c11";
const schedule = {
  startsAt: "2999-01-01T00:00:00.000Z",
  expiresAt: "2999-01-02T00:00:00.000Z",
  durationMinutes: 30,
};

const adminOperations: Array<[string, () => Promise<unknown>]> = [
  ["list", () => customTestController.list(caller)],
  ["republish", () => customTestController.republish(caller, { testId: ID, ...schedule })],
  [
    "importToBank",
    () => customTestController.importToBank(caller, { testId: ID, examType: "RN", topic: "T" }),
  ],
  [
    "create",
    () =>
      customTestController.create(caller, {
        title: "T",
        description: "",
        examType: "RN",
        sourceMode: "existing",
        allocations: [{ topic: "T", count: 1 }],
        questions: [],
        ...schedule,
      }),
  ],
];

const test = {
  id: "t1",
  owner_id: "u2",
  owner_username: null,
  title: "T",
  description: null,
  exam_type: "RN",
  source_mode: "upload",
  duration_minutes: 30,
  starts_at: "a",
  expires_at: "b",
  status: "published",
  created_at: "c",
  share_token: "tok",
  state: "closed",
  question_count: 1,
  participant_count: 1,
  pass_count: 1,
  average_score: 50,
  custom_unimported: 0,
};
const finished = {
  id: "a1",
  custom_test_id: "t1",
  email: "ada.obi@example.com",
  score_pct: 50,
  correct_count: 1,
  total_questions: 2,
  completed_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  roles.central = false;
  confirmedEmail.value = "taker@example.com";
});

describe("customTestController: admin operations", () => {
  it.each(adminOperations)(
    "%s: a non-admin is refused before anything is touched",
    async (_name, run) => {
      assertAdmin.mockRejectedValue(
        new ForbiddenError("You are not authorized to manage content."),
      );
      await expect(run()).rejects.toBeInstanceOf(ForbiddenError);
      for (const method of Object.values(store)) expect(method).not.toHaveBeenCalled();
    },
  );

  it("checks the signed-in user, then lets an admin list their tests", async () => {
    assertAdmin.mockResolvedValue(undefined);
    expect(await customTestController.list(caller)).toEqual([]);
    expect(assertAdmin).toHaveBeenCalledWith(caller.supabase, "user-1");
    expect(store.tests).toHaveBeenCalledWith("user-1");
  });

  it("shows participant addresses in full to the central admin (by the database's role check) and masked to others", async () => {
    assertAdmin.mockResolvedValue(undefined);
    store.tests.mockResolvedValue([test]);
    store.closedAttempts.mockResolvedValue([finished]);
    roles.central = true;
    expect((await customTestController.list(caller))[0].attempts[0].email).toBe(
      "ada.obi@example.com",
    );
    roles.central = false;
    expect((await customTestController.list(caller))[0].attempts[0].email).toBe("a•••@example.com");
  });

  it("returns the link token when a test is created, so the admin can copy it at once", async () => {
    assertAdmin.mockResolvedValue(undefined);
    const created = await customTestController.create(caller, {
      title: "T",
      description: "",
      examType: "RN",
      sourceMode: "existing",
      allocations: [{ topic: "T", count: 1 }],
      questions: [],
      ...schedule,
    });
    expect(created).toEqual({ id: "t1", token: expect.stringMatching(/^[0-9a-f]{48}$/) });
  });
});

describe("customTestController: public operations", () => {
  it("never asks for an admin, and counts the caller's address", async () => {
    await customTestController.getShared({ tokenHash: HASH }, "203.0.113.9");
    expect(assertAdmin).not.toHaveBeenCalled();
    expect(consume).toHaveBeenCalledWith(
      "shared-view:ip:203.0.113.9",
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("turns an unexpected database failure into a generic error with no database text", async () => {
    store.sharedState.mockRejectedValueOnce(
      new Error('relation "custom_tests" is locked (pw=hunter2)'),
    );
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = await customTestController
      .getShared({ tokenHash: HASH }, "1.1.1.1")
      .catch((e: unknown) => e);
    expect(error).toMatchObject({
      code: "INTERNAL",
      message: "Something went wrong. Please try again.",
    });
    expect(JSON.stringify(error)).not.toMatch(/hunter2|relation/);
    errors.mockRestore();
  });

  it("limits repeated attempts to start from one address", async () => {
    consume.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 300 });
    await expect(
      customTestController.startShared(
        { tokenHash: HASH, email: "a@b.co", accessKey: KEY },
        "1.1.1.1",
      ),
    ).rejects.toMatchObject({ code: "LIMIT_REACHED", statusCode: 429 });
    expect(store.startAttempt).not.toHaveBeenCalled();
  });

  it("claims only with the address the identity provider confirmed, never one from the request", async () => {
    store.attempt.mockResolvedValueOnce({ email: "taker@example.com" });
    store.claimAttempt.mockResolvedValueOnce(true);
    expect(
      await customTestController.claim({ userId: "user-1" }, { attemptId: ID, accessKey: KEY }),
    ).toEqual({ claimed: true });
  });

  it("refuses to claim when the account's email is not confirmed", async () => {
    store.attempt.mockResolvedValueOnce({ email: "taker@example.com" });
    confirmedEmail.value = null;
    await expect(
      customTestController.claim({ userId: "user-1" }, { attemptId: ID, accessKey: KEY }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(store.claimAttempt).not.toHaveBeenCalled();
  });
});
