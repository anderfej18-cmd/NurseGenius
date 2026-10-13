import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addQuestion, runSession, serviceCall } from "./fixtures";
import { createTestDb, type TestDb } from "./pglite-db";

let db: TestDb;
let alice: string;
let bob: string;
let q1: string;
let q2: string;

interface Limit {
  allowed: boolean;
  remaining: number;
  retry_after_seconds: number;
}
const consume = (bucket: string, limit: number, windowSeconds: number) =>
  serviceCall<Limit>(db, `SELECT * FROM public.consume_rate_limit($1, $2, $3)`, [
    bucket,
    limit,
    windowSeconds,
  ]).then((rows) => rows[0]);

beforeAll(async () => {
  db = await createTestDb();
  [alice, bob] = await Promise.all(
    ["alice", "bob"].map((name) => db.createUser(`${name}-rl@example.com`)),
  );
  q1 = await addQuestion(db, { correct: "A" });
  q2 = await addQuestion(db, { correct: "B" });
});
afterAll(() => db.pg.close());

describe("consume_rate_limit", () => {
  it("allows up to the limit in a window and then refuses, saying how long to wait", async () => {
    const results: Limit[] = [];
    for (let i = 0; i < 4; i += 1) results.push(await consume("t:basic", 3, 3600));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0]);
    expect(results[3].retry_after_seconds).toBeGreaterThan(0);
    expect(results[3].retry_after_seconds).toBeLessThanOrEqual(3600);
  });

  it("counts every caller exactly, even when they arrive together", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => consume("t:concurrent", 5, 3600)),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
  });

  it("keeps buckets apart, and windows of different lengths apart", async () => {
    await consume("t:a", 1, 3600);
    expect((await consume("t:a", 1, 3600)).allowed).toBe(false);
    expect((await consume("t:b", 1, 3600)).allowed).toBe(true);
    expect((await consume("t:a", 1, 60)).allowed).toBe(true);
  });

  it("refuses a nonsensical limit, window or bucket", async () => {
    for (const [bucket, limit, window] of [
      ["", 1, 60],
      ["x", 0, 60],
      ["x", 10_001, 60],
      ["x", 1, 0],
      ["x", 1, 8 * 86_400],
      ["x".repeat(201), 1, 60],
    ] as const) {
      await expect(consume(bucket, limit, window)).rejects.toThrow(/invalid_rate_limit/);
    }
  });

  it("clears windows nobody can still be inside, and keeps ones a 7-day window could still use", async () => {
    await db.admin(
      `INSERT INTO app_private.rate_limit_hits (bucket, window_start, hits)
       VALUES ('t:dead', now() - interval '9 days', 9), ('t:maybe-live', now() - interval '5 days', 9)`,
    );
    await consume("t:fresh-window", 1, 3600);
    const left = await db.admin<{ bucket: string }>(
      `SELECT bucket FROM app_private.rate_limit_hits WHERE bucket IN ('t:dead', 't:maybe-live')`,
    );
    expect(left.map((row) => row.bucket)).toEqual(["t:maybe-live"]);
  });

  it("is not callable by a signed-in student or an anonymous visitor, and its table is closed", async () => {
    const call = `SELECT * FROM public.consume_rate_limit('t:x', 1, 60)`;
    await expect(db.as("authenticated", alice, call)).rejects.toThrow(/permission denied/i);
    await expect(db.as("anon", null, call)).rejects.toThrow(/permission denied/i);
    await expect(
      db.as("authenticated", alice, `SELECT * FROM app_private.rate_limit_hits`),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe("get_explainable_question (signed-in student, own finished exam)", () => {
  const explain = (user: string, exam: string, question: string) =>
    serviceCall<{ question_text: string; correct_answer: string; user_answer: string | null }>(
      db,
      `SELECT * FROM public.get_explainable_question($1, $2, $3)`,
      [user, exam, question],
    );

  it("returns the question, its key and the student's answer once the exam is finished", async () => {
    const exam = await runSession(db, alice, [
      [q1, "B"],
      [q2, "B"],
    ]);
    const rows = await explain(alice, exam, q1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ correct_answer: "A", user_answer: "B" });
  });

  it("returns the official rationale with the question, or null when it has none", async () => {
    await db.admin(`UPDATE public.questions SET rationale = 'Because A.' WHERE id = $1`, [q1]);
    await db.admin(`UPDATE public.questions SET rationale = NULL WHERE id = $1`, [q2]);
    const exam = await runSession(
      db,
      alice,
      [
        [q1, "A"],
        [q2, "B"],
      ],
      { today: "2026-10-08" },
    );
    const rows = await serviceCall<{ rationale: string | null }>(
      db,
      `SELECT * FROM public.get_explainable_question($1, $2, $3)`,
      [alice, exam, q1],
    );
    expect(rows[0].rationale).toBe("Because A.");
    const none = await serviceCall<{ rationale: string | null }>(
      db,
      `SELECT * FROM public.get_explainable_question($1, $2, $3)`,
      [alice, exam, q2],
    );
    expect(none[0].rationale).toBeNull();
  });

  it("returns nothing while the exam is still running, so the key stays protected", async () => {
    await db.admin(`DELETE FROM public.exams WHERE user_id = $1 AND status = 'in_progress'`, [bob]);
    const exam = await runSession(db, bob, [[q1, "A"]], { submit: false });
    expect(await explain(bob, exam, q1)).toEqual([]);
  });

  it("returns nothing for someone else's exam, or a question that is not in the exam", async () => {
    const exam = await runSession(db, alice, [[q1, "A"]], { today: "2026-10-07" });
    expect(await explain(bob, exam, q1)).toEqual([]);
    expect(await explain(alice, exam, q2)).toEqual([]);
  });

  it("is not callable by a signed-in student", async () => {
    await expect(
      db.as("authenticated", alice, `SELECT * FROM public.get_explainable_question($1, $2, $3)`, [
        alice,
        "00000000-0000-4000-8000-000000000001",
        q1,
      ]),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe("get_explainable_shared_question (shared-test attempt key)", () => {
  const HASH = "h".repeat(64);
  let testId: string;
  let questionId: string;
  let otherTestQuestion: string;

  /** A guest attempt by default; pass a user to link it to an account, as the verified claim does. */
  const attempt = async (status: string, hash = HASH, user: string | null = null) => {
    const [{ id }] = await db.admin<{ id: string }>(
      `INSERT INTO public.custom_test_attempts (custom_test_id, email, access_hash, total_questions, status, user_id)
       VALUES ($1, 'taker@example.com', $2, 1, $3, $4) RETURNING id`,
      [testId, hash, status, user],
    );
    return id;
  };
  const explain = (attemptId: string, hash: string, question: string) =>
    serviceCall<{ correct_answer: string; topic: string }>(
      db,
      `SELECT * FROM public.get_explainable_shared_question($1, $2, $3)`,
      [attemptId, hash, question],
    );

  beforeAll(async () => {
    const owner = await db.createUser("owner-rl@example.com");
    const mk = async (hash: string) =>
      (
        await db.admin<{ id: string }>(
          `INSERT INTO public.custom_tests (owner_id, title, exam_type, duration_minutes, expires_at, token_hash, status)
           VALUES ($1, 'T', 'RN', 30, now() + interval '1 day', $2, 'published') RETURNING id`,
          [owner, hash],
        )
      )[0].id;
    testId = await mk("a".repeat(64));
    const otherTest = await mk("b".repeat(64));
    const add = async (test: string) =>
      (
        await db.admin<{ id: string }>(
          `INSERT INTO public.custom_test_questions (custom_test_id, source_kind, question_text, option_a, option_b, option_c, option_d, correct_answer, position)
           VALUES ($1, 'custom', 'Q?', 'a', 'b', 'c', 'd', 'C', 0) RETURNING id`,
          [test],
        )
      )[0].id;
    questionId = await add(testId);
    otherTestQuestion = await add(otherTest);
  });

  it("returns the question and key for a finished attempt linked to an account, with the right key hash", async () => {
    const id = await attempt("completed", HASH, alice);
    const rows = await explain(id, HASH, questionId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ correct_answer: "C", topic: "RN" });
  });

  it("returns nothing for a guest attempt, however finished and however right the key", async () => {
    const guest = await attempt("completed", "g".repeat(64));
    expect(await explain(guest, "g".repeat(64), questionId)).toEqual([]);
  });

  it("returns nothing for an unfinished attempt, a wrong key, or another test's question", async () => {
    const running = await attempt("in_progress", "r".repeat(64), alice);
    expect(await explain(running, "r".repeat(64), questionId)).toEqual([]);
    const done = await attempt("completed", "d".repeat(64), alice);
    expect(await explain(done, "x".repeat(64), questionId)).toEqual([]);
    expect(await explain(done, "d".repeat(64), otherTestQuestion)).toEqual([]);
  });

  it("is not callable by a signed-in student or an anonymous visitor", async () => {
    const call = `SELECT * FROM public.get_explainable_shared_question($1, $2, $3)`;
    const args = ["00000000-0000-4000-8000-000000000001", HASH, questionId];
    await expect(db.as("authenticated", alice, call, args)).rejects.toThrow(/permission denied/i);
    await expect(db.as("anon", null, call, args)).rejects.toThrow(/permission denied/i);
  });
});
