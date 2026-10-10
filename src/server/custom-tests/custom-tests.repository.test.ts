import { describe, expect, it } from "vitest";
import { ConflictError, NotFoundError } from "../errors";
import { createFakeSupabase } from "../testing/fake-supabase";
import { SupabaseCustomTestStore } from "./custom-tests.repository.server";

const HASH = "a".repeat(64);
const argsOf = (fake: ReturnType<typeof createFakeSupabase>, target: string, method: string) =>
  fake.callsOn(target, method).map((call) => call.args);
const NOW = new Date("2026-10-10T10:00:00.000Z");

describe("SupabaseCustomTestStore", () => {
  it("creates a test through the atomic function, naming the admin", async () => {
    const fake = createFakeSupabase([{ data: "test-1" }]);
    const id = await new SupabaseCustomTestStore(fake.client).createTest("admin-1", {
      title: "Mock",
      description: "",
      examType: "RN",
      sourceMode: "upload",
      durationMinutes: 30,
      expiresAt: "2026-10-11T10:00:00.000Z",
      tokenHash: HASH,
      questions: [
        {
          question_text: "Q",
          option_a: "a",
          option_b: "b",
          option_c: "c",
          option_d: "d",
          correct_answer: "A",
          rationale: null,
          source_kind: "custom",
        },
      ],
    });
    expect(id).toBe("test-1");
    const [args] = argsOf(fake, "rpc:create_custom_test", "args");
    expect(args[0]).toMatchObject({ _owner_id: "admin-1", _token_hash: HASH, _exam_type: "RN" });
  });

  it("lists the owner's summaries with the numbers parsed", async () => {
    const fake = createFakeSupabase([
      {
        data: [
          {
            id: "t1",
            title: "T",
            description: null,
            exam_type: "RN",
            source_mode: "upload",
            duration_minutes: 30,
            expires_at: "x",
            status: "published",
            created_at: "y",
            question_count: 5,
            participant_count: 2,
            pass_count: 1,
            average_score: "62.50",
          },
        ],
      },
    ]);
    const [row] = await new SupabaseCustomTestStore(fake.client).summaries("admin-1");
    expect(argsOf(fake, "rpc:list_custom_test_summaries", "args")[0][0]).toEqual({
      _owner_id: "admin-1",
    });
    expect(row.average_score).toBe(62.5);
  });

  it("reads finished attempts for the given tests in one bounded query, never the attempt key hash", async () => {
    const fake = createFakeSupabase([
      {
        data: [
          {
            id: "a1",
            custom_test_id: "t1",
            email: "a@b.co",
            score_pct: "90.00",
            correct_count: 4,
            total_questions: 5,
            completed_at: "z",
            access_hash: "SECRET",
          },
        ],
      },
    ]);
    const rows = await new SupabaseCustomTestStore(fake.client).completedAttempts(["t1", "t2"]);
    expect(argsOf(fake, "from:custom_test_attempts", "in")[0]).toEqual([
      "custom_test_id",
      ["t1", "t2"],
    ]);
    expect(argsOf(fake, "from:custom_test_attempts", "eq")).toContainEqual(["status", "completed"]);
    expect(argsOf(fake, "from:custom_test_attempts", "limit")).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain("SECRET");
    expect(rows[0].score_pct).toBe(90);
  });

  it("finds only a published, unexpired test by its link hash", async () => {
    const fake = createFakeSupabase([
      {
        data: {
          id: "t1",
          title: "T",
          description: null,
          exam_type: "RN",
          duration_minutes: 30,
          expires_at: "x",
        },
      },
    ]);
    const test = await new SupabaseCustomTestStore(fake.client).findPublished(HASH, NOW);
    expect(argsOf(fake, "from:custom_tests", "eq")).toEqual(
      expect.arrayContaining([
        ["token_hash", HASH],
        ["status", "published"],
      ]),
    );
    expect(argsOf(fake, "from:custom_tests", "gt")[0]).toEqual(["expires_at", NOW.toISOString()]);
    expect(test).toMatchObject({ id: "t1", examType: "RN", durationMinutes: 30 });
    expect(
      await new SupabaseCustomTestStore(createFakeSupabase([{ data: null }]).client).findPublished(
        HASH,
        NOW,
      ),
    ).toBeNull();
  });

  it("selects shared questions without the answer key or rationale", async () => {
    const fake = createFakeSupabase([{ data: [] }]);
    await new SupabaseCustomTestStore(fake.client).sharedQuestions("t1");
    const columns = String(argsOf(fake, "from:custom_test_questions", "select")[0][0]);
    expect(columns).not.toMatch(/correct_answer|rationale/);
    expect(argsOf(fake, "from:custom_test_questions", "eq")[0]).toEqual(["custom_test_id", "t1"]);
  });

  it("inserts an attempt and returns only its id and start time", async () => {
    const fake = createFakeSupabase([{ data: { id: "att-1", started_at: "s" } }]);
    const attempt = await new SupabaseCustomTestStore(fake.client).insertAttempt({
      testId: "t1",
      email: "a@b.co",
      accessHash: "h",
      totalQuestions: 5,
    });
    expect(attempt).toEqual({ attemptId: "att-1", startedAt: "s" });
    expect(argsOf(fake, "from:custom_test_attempts", "insert")[0][0]).toEqual({
      custom_test_id: "t1",
      email: "a@b.co",
      access_hash: "h",
      total_questions: 5,
    });
  });

  it("submits through the atomic function and turns its named refusals into typed errors", async () => {
    const ok = createFakeSupabase([{ data: { score: 80, correct: 4, total: 5, results: [] } }]);
    expect(
      await new SupabaseCustomTestStore(ok.client).submitAttempt("att-1", "h", [
        { question_id: "q", user_answer: "A" },
      ]),
    ).toMatchObject({ score: 80 });
    expect(argsOf(ok, "rpc:submit_shared_attempt", "args")[0][0]).toEqual({
      _attempt_id: "att-1",
      _access_hash: "h",
      _answers: [{ question_id: "q", user_answer: "A" }],
    });
    const closed = createFakeSupabase([{ error: { message: "ERROR: attempt_closed" } }]);
    await expect(
      new SupabaseCustomTestStore(closed.client).submitAttempt("a", "h", []),
    ).rejects.toBeInstanceOf(ConflictError);
    const missing = createFakeSupabase([{ error: { message: "ERROR: attempt_not_found" } }]);
    await expect(
      new SupabaseCustomTestStore(missing.client).submitAttempt("a", "h", []),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("finds an attempt by id and key hash, and claims it only while it has no owner", async () => {
    const fake = createFakeSupabase([
      { data: { id: "att-1", email: "a@b.co", user_id: null } },
      { data: [{ id: "att-1" }] },
    ]);
    const store = new SupabaseCustomTestStore(fake.client);
    expect(await store.findAttempt("att-1", "h")).toEqual({
      id: "att-1",
      email: "a@b.co",
      userId: null,
    });
    expect(await store.claimAttempt("att-1", "h", "user-1")).toBe(true);
    expect(argsOf(fake, "from:custom_test_attempts", "is")[0]).toEqual(["user_id", null]);
    expect(argsOf(fake, "from:custom_test_attempts", "update")[0][0]).toEqual({
      user_id: "user-1",
    });
  });

  it("republishes only a test the admin owns, and reports whether one matched", async () => {
    const fake = createFakeSupabase([{ data: [{ id: "t1" }] }, { data: [] }]);
    const store = new SupabaseCustomTestStore(fake.client);
    expect(await store.republish("admin-1", "t1", HASH, "2026-10-12T00:00:00.000Z")).toBe(true);
    expect(argsOf(fake, "from:custom_tests", "eq")).toEqual(
      expect.arrayContaining([
        ["id", "t1"],
        ["owner_id", "admin-1"],
      ]),
    );
    expect(await store.republish("admin-1", "t2", HASH, "2026-10-12T00:00:00.000Z")).toBe(false);
  });

  it("imports through the atomic function, naming the admin, and maps 'not yours' to not found", async () => {
    const fake = createFakeSupabase([{ data: 5 }, { error: { message: "ERROR: test_not_found" } }]);
    const store = new SupabaseCustomTestStore(fake.client);
    expect(await store.importToBank("admin-1", "t1", "Topic")).toBe(5);
    expect(argsOf(fake, "rpc:import_custom_test_to_bank", "args")[0][0]).toEqual({
      _admin_id: "admin-1",
      _test_id: "t1",
      _topic: "Topic",
    });
    await expect(store.importToBank("admin-2", "t1", "Topic")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
