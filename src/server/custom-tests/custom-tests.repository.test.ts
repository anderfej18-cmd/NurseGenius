import { describe, expect, it } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { createFakeSupabase } from "../testing/fake-supabase";
import { SupabaseCustomTestStore } from "./custom-tests.repository.server";

const HASH = "a".repeat(64);
const argsOf = (fake: ReturnType<typeof createFakeSupabase>, target: string) =>
  fake.callsOn(target, "args").map((call) => call.args[0]);
const link = { token: "tok", tokenHash: HASH };
const schedule = {
  startsAt: "2026-10-11T10:00:00.000Z",
  expiresAt: "2026-10-12T10:00:00.000Z",
  durationMinutes: 30,
};
const store = (fake: ReturnType<typeof createFakeSupabase>) =>
  new SupabaseCustomTestStore(fake.client);

describe("SupabaseCustomTestStore: administration", () => {
  it("creates a test through the atomic function, naming the admin, the schedule, the link and the allocations", async () => {
    const fake = createFakeSupabase([{ data: "test-1" }]);
    const id = await store(fake).createTest(
      "admin-1",
      {
        title: "Mock",
        description: "",
        examType: "RN",
        sourceMode: "existing",
        allocations: [{ topic: "Pharmacology", count: 5 }],
        questions: [],
        ...schedule,
      },
      link,
    );
    expect(id).toBe("test-1");
    expect(argsOf(fake, "rpc:create_live_test")[0]).toMatchObject({
      _owner_id: "admin-1",
      _token_hash: HASH,
      _share_token: "tok",
      _exam_type: "RN",
      _starts_at: schedule.startsAt,
      _expires_at: schedule.expiresAt,
      _allocations: [{ topic: "Pharmacology", count: 5 }],
    });
  });

  it("turns the database's named refusals into typed errors", async () => {
    const pool = createFakeSupabase([{ error: { message: "allocation_exceeds_pool:Pool B:3" } }]);
    await expect(
      store(pool).createTest(
        "a",
        {
          title: "t",
          description: "",
          examType: "RN",
          sourceMode: "existing",
          allocations: [],
          questions: [],
          ...schedule,
        },
        link,
      ),
    ).rejects.toThrow(/Only 3 eligible questions are available in “Pool B”/);
    const bad = createFakeSupabase([{ error: { message: "invalid_schedule" } }]);
    await expect(store(bad).republish("a", "t", schedule, link)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("republishes through the function with the actor, schedule and new link", async () => {
    const fake = createFakeSupabase([{ data: null }]);
    await store(fake).republish("admin-1", "test-1", schedule, link);
    expect(argsOf(fake, "rpc:republish_live_test")[0]).toEqual({
      _actor_id: "admin-1",
      _test_id: "test-1",
      _token_hash: HASH,
      _share_token: "tok",
      _starts_at: schedule.startsAt,
      _expires_at: schedule.expiresAt,
      _duration_minutes: 30,
    });
  });

  it("is not found for a test the actor may not manage", async () => {
    const fake = createFakeSupabase([{ error: { message: "test_not_found" } }]);
    await expect(store(fake).republish("a", "t", schedule, link)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("lists the actor's tests with the numbers parsed", async () => {
    const fake = createFakeSupabase([
      {
        data: [
          {
            id: "t1",
            owner_id: "u1",
            owner_username: "ada",
            title: "T",
            description: null,
            exam_type: "RN",
            source_mode: "upload",
            duration_minutes: 30,
            starts_at: "s",
            expires_at: "e",
            status: "published",
            created_at: "c",
            share_token: "tok",
            state: "live",
            question_count: 5,
            participant_count: 2,
            pass_count: 1,
            average_score: "62.50",
            custom_unimported: 3,
          },
        ],
      },
    ]);
    const [row] = await store(fake).tests("admin-1");
    expect(row).toMatchObject({ average_score: 62.5, state: "live", custom_unimported: 3 });
    expect(argsOf(fake, "rpc:list_live_tests")[0]).toEqual({ _actor_id: "admin-1" });
  });

  it("reads closed attempts through the function, which decides who may see them", async () => {
    const fake = createFakeSupabase([
      {
        data: [
          {
            id: "a",
            custom_test_id: "t1",
            email: "x@y.z",
            score_pct: "80.00",
            correct_count: 4,
            total_questions: 5,
            completed_at: "c",
          },
        ],
      },
    ]);
    expect(await store(fake).closedAttempts("admin-1", ["t1"])).toEqual([
      {
        id: "a",
        custom_test_id: "t1",
        email: "x@y.z",
        score_pct: 80,
        correct_count: 4,
        total_questions: 5,
        completed_at: "c",
      },
    ]);
    expect(argsOf(fake, "rpc:list_test_attempts")[0]).toEqual({
      _actor_id: "admin-1",
      _test_ids: ["t1"],
    });
  });

  it("imports through the audited function and reports added and skipped", async () => {
    const fake = createFakeSupabase([{ data: { added: 4, skipped: 1 } }]);
    expect(await store(fake).importQuestions("admin-1", "t1", "RM", "Maternal")).toEqual({
      added: 4,
      skipped: 1,
    });
    expect(argsOf(fake, "rpc:import_live_test_questions")[0]).toEqual({
      _actor_id: "admin-1",
      _test_id: "t1",
      _exam_type: "RM",
      _topic: "Maternal",
    });
  });
});

describe("SupabaseCustomTestStore: candidates", () => {
  it("reads the state of a link: the shape of a test that exists, only 'closed' for one that does not", async () => {
    const live = createFakeSupabase([
      {
        data: {
          state: "upcoming",
          server_now: "n",
          title: "T",
          description: null,
          exam_type: "RN",
          duration_minutes: 30,
          question_count: 5,
          starts_at: "s",
          expires_at: "e",
        },
      },
    ]);
    expect(await store(live).sharedState(HASH)).toEqual({
      state: "upcoming",
      serverNow: "n",
      test: {
        title: "T",
        description: null,
        examType: "RN",
        durationMinutes: 30,
        questionCount: 5,
        startsAt: "s",
        expiresAt: "e",
      },
    });
    const gone = createFakeSupabase([{ data: { state: "closed", server_now: "n" } }]);
    expect(await store(gone).sharedState(HASH)).toEqual({
      state: "closed",
      serverNow: "n",
      test: null,
    });
  });

  it("starts an attempt in one function call, with the key's hash only", async () => {
    const fake = createFakeSupabase([{ data: { attempt_id: "att-1", started_at: "x" } }]);
    expect(await store(fake).startAttempt(HASH, "a@b.co", "keyhash")).toEqual({
      attemptId: "att-1",
    });
    expect(argsOf(fake, "rpc:start_shared_attempt")[0]).toEqual({
      _token_hash: HASH,
      _email: "a@b.co",
      _access_hash: "keyhash",
    });
  });

  it("names the schedule refusals as typed errors", async () => {
    const early = createFakeSupabase([{ error: { message: "test_not_started" } }]);
    await expect(store(early).startAttempt(HASH, "a@b.co", "k")).rejects.toBeInstanceOf(
      ConflictError,
    );
    const closed = createFakeSupabase([{ error: { message: "test_closed" } }]);
    await expect(store(closed).startAttempt(HASH, "a@b.co", "k")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("reads an attempt as its device sees it, questions carrying no key", async () => {
    const fake = createFakeSupabase([
      {
        data: {
          status: "in_progress",
          server_now: "n",
          started_at: "s",
          deadline_at: "d",
          test: { title: "T", description: null, exam_type: "RN", duration_minutes: 30 },
          user_id: null,
          email: "a@b.co",
          result: null,
          questions: [
            {
              id: "q1",
              position: 0,
              question_text: "Q",
              option_a: "a",
              option_b: "b",
              option_c: "c",
              option_d: "d",
              answer: "B",
              flagged: true,
            },
          ],
        },
      },
    ]);
    const attempt = await store(fake).attempt("att-1", "keyhash");
    expect(attempt).toMatchObject({
      status: "in_progress",
      linked: false,
      email: "a@b.co",
      deadlineAt: "d",
    });
    expect(attempt.questions[0]).toMatchObject({ answer: "B", flagged: true });
    expect(JSON.stringify(attempt)).not.toMatch(/correct_answer/);
  });

  it("saves one answer through the function, sending no answer as null", async () => {
    const fake = createFakeSupabase([{ data: null }]);
    await store(fake).saveAnswer({
      attemptId: "att-1",
      accessHash: "h",
      questionId: "q1",
      answer: "B",
      flagged: true,
    });
    expect(argsOf(fake, "rpc:save_shared_answer")[0]).toMatchObject({
      _answer: "B",
      _flagged: true,
    });
    const expired = createFakeSupabase([{ error: { message: "attempt_expired" } }]);
    await expect(
      store(expired).saveAnswer({
        attemptId: "att-1",
        accessHash: "h",
        questionId: "q1",
        answer: null,
        flagged: false,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("submits only the key's hash and the answers, never a score", async () => {
    const fake = createFakeSupabase([{ data: { score: 80, correct: 4, total: 5, results: [] } }]);
    await store(fake).submitAttempt("att-1", "keyhash", [{ question_id: "q1", user_answer: "A" }]);
    expect(argsOf(fake, "rpc:submit_shared_attempt")[0]).toEqual({
      _attempt_id: "att-1",
      _access_hash: "keyhash",
      _answers: [{ question_id: "q1", user_answer: "A" }],
    });
  });

  it("claims only an unclaimed attempt with the right key", async () => {
    const fake = createFakeSupabase([{ data: [{ id: "att-1" }] }]);
    expect(await store(fake).claimAttempt("att-1", "keyhash", "user-1")).toBe(true);
    expect(fake.callsOn("from:custom_test_attempts", "update").map((c) => c.args)).toEqual([
      [{ user_id: "user-1" }],
    ]);
    expect(fake.callsOn("from:custom_test_attempts", "eq").map((c) => c.args)).toEqual([
      ["id", "att-1"],
      ["access_hash", "keyhash"],
    ]);
    expect(fake.callsOn("from:custom_test_attempts", "is").map((c) => c.args)).toEqual([
      ["user_id", null],
    ]);
    expect(
      await store(createFakeSupabase([{ data: [] }])).claimAttempt("att-1", "keyhash", "user-1"),
    ).toBe(false);
  });
});
