import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "../errors";

const store = vi.hoisted(() => ({
  createTest: vi.fn(async () => "t1"),
  summaries: vi.fn(async () => []),
  completedAttempts: vi.fn(async () => []),
  findPublished: vi.fn(async () => null),
  sharedQuestions: vi.fn(async () => []),
  countQuestions: vi.fn(async () => 0),
  insertAttempt: vi.fn(),
  submitAttempt: vi.fn(),
  findAttempt: vi.fn(async () => null),
  claimAttempt: vi.fn(),
  republish: vi.fn(async () => true),
  importToBank: vi.fn(async () => 1),
}));
const consume = vi.hoisted(() => vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })));
const assertAdmin = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
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

const caller = { userId: "user-1", supabase: {} as never };
const HASH = "a".repeat(64);
const ID = "6f1c2f6e-0a53-4a54-9d3b-6a6f2b7a0c11";

const adminOperations: Array<[string, () => Promise<unknown>]> = [
  ["list", () => customTestController.list(caller)],
  [
    "republish",
    () =>
      customTestController.republish(caller, {
        testId: ID,
        tokenHash: HASH,
        expiresAt: "2999-01-01T00:00:00.000Z",
      }),
  ],
  ["importToBank", () => customTestController.importToBank(caller, { testId: ID, topic: "T" })],
];

beforeEach(() => vi.clearAllMocks());

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
    expect(store.summaries).toHaveBeenCalledWith("user-1");
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
    store.findPublished.mockRejectedValueOnce(
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
        { tokenHash: HASH, email: "a@b.co", accessKey: "k".repeat(40) },
        "1.1.1.1",
      ),
    ).rejects.toMatchObject({ code: "LIMIT_REACHED", statusCode: 429 });
    expect(store.insertAttempt).not.toHaveBeenCalled();
  });

  it("claims with the signed-in account's email, never one from the request", async () => {
    store.findAttempt.mockResolvedValueOnce({
      id: ID,
      email: "taker@example.com",
      userId: null,
    } as never);
    store.claimAttempt.mockResolvedValueOnce(true);
    expect(
      await customTestController.claim(
        { userId: "user-1", email: "Taker@Example.com" },
        { attemptId: ID, accessKey: "k".repeat(40) },
      ),
    ).toEqual({ claimed: true });
  });
});
