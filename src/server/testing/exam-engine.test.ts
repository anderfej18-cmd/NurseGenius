import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./pglite-db";

let db: TestDb;
let questionCounter = 0;

async function addQuestion(correct = "A", topic = "Pharmacology", examType = "RN") {
  questionCounter += 1;
  const [row] = await db.admin<{ id: string }>(
    `INSERT INTO public.questions (exam_type, topic, question_text, option_a, option_b, option_c, option_d, correct_answer, rationale)
     VALUES ($1::public.exam_type, $2, $3, 'a', 'b', 'c', 'd', $4, 'because') RETURNING id`,
    [examType, topic, `Question number ${questionCounter}?`, correct],
  );
  return row.id;
}

const TODAY = "2026-10-06";

async function start(userId: string, questionIds: string[], minutes = 30) {
  const [row] = await db.as<{ start_exam_session: string }>(
    "service_role",
    null,
    `SELECT public.start_exam_session($1, 'RN', 'All Areas', 'mixed', $2, $3, $4::uuid[], $5::date) AS start_exam_session`,
    [userId, minutes, ["Pharmacology"], `{${questionIds.join(",")}}`, TODAY],
  );
  return row.start_exam_session;
}

const save = (
  userId: string,
  examId: string,
  questionId: string,
  args: {
    answer?: string | null;
    confidence?: string | null;
    flagged?: boolean | null;
    timeMs?: number | null;
  } = {},
) =>
  db
    .as<{
      r: string;
    }>(
      "service_role",
      null,
      `SELECT public.save_exam_answer($1, $2, $3, 10, $4, $5, $6, $7) AS r`,
      [
        userId,
        examId,
        questionId,
        args.answer ?? null,
        args.confidence ?? null,
        args.flagged ?? null,
        args.timeMs ?? null,
      ],
    )
    .then((rows) => rows[0].r);

const submit = (userId: string, examId: string) =>
  db
    .as<{
      r: Record<string, unknown>;
    }>("service_role", null, `SELECT public.submit_exam_session($1, $2) AS r`, [userId, examId])
    .then((rows) => rows[0].r);

const exam = async (id: string) =>
  (await db.admin<Record<string, unknown>>(`SELECT * FROM public.exams WHERE id = $1`, [id]))[0];
const answers = (examId: string) =>
  db.admin<Record<string, unknown>>(
    `SELECT * FROM public.exam_answers WHERE exam_id = $1 ORDER BY position`,
    [examId],
  );
const stats = (userId: string, questionId: string) =>
  db
    .admin<
      Record<string, unknown>
    >(`SELECT * FROM public.user_question_stats WHERE user_id = $1 AND question_id = $2`, [userId, questionId])
    .then((r) => r[0]);

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(() => db.pg.close());

describe("start_exam_session", () => {
  it("creates the session, ordered answers with topic snapshots, a server deadline and the daily counter", async () => {
    const user = await db.createUser("start@example.com");
    const q1 = await addQuestion();
    const q2 = await addQuestion("B");
    const examId = await start(user, [q1, q2], 45);

    const row = await exam(examId);
    expect(row).toMatchObject({
      user_id: user,
      status: "in_progress",
      total_questions: 2,
      time_limit_minutes: 45,
      session_type: "mixed",
    });
    const startedAt = new Date(row.started_at as string).getTime();
    expect(new Date(row.deadline_at as string).getTime() - startedAt).toBe(45 * 60 * 1000);

    const rows = await answers(examId);
    expect(rows.map((r) => r.question_id)).toEqual([q1, q2]);
    expect(rows.map((r) => r.position)).toEqual([0, 1]);
    expect(rows[0]).toMatchObject({ topic: "Pharmacology", user_answer: null, is_correct: null });

    const [profile] = await db.admin<{ questions_today: number; last_question_date: string }>(
      `SELECT questions_today, last_question_date::text FROM public.profiles WHERE id = $1`,
      [user],
    );
    expect(profile).toMatchObject({ questions_today: 2, last_question_date: TODAY });
  });

  it("adds to today's counter and resets it on a new day", async () => {
    const user = await db.createUser("counter@example.com");
    const q = await addQuestion();
    const first = await start(user, [q]);
    await submit(user, first);
    await start(user, [q]);
    const [{ questions_today }] = await db.admin<{ questions_today: number }>(
      `SELECT questions_today FROM public.profiles WHERE id = $1`,
      [user],
    );
    expect(questions_today).toBe(2);

    await db.admin(
      `UPDATE public.profiles SET last_question_date = '2026-10-05', questions_today = 40 WHERE id = $1`,
      [user],
    );
    await submit(
      user,
      (
        await db.admin<{ id: string }>(
          `SELECT id FROM public.exams WHERE user_id = $1 AND status = 'in_progress'`,
          [user],
        )
      )[0].id,
    );
    await start(user, [q]);
    const [{ questions_today: after }] = await db.admin<{ questions_today: number }>(
      `SELECT questions_today FROM public.profiles WHERE id = $1`,
      [user],
    );
    expect(after).toBe(1);
  });

  it("rejects question ids that are not active questions of the exam type", async () => {
    const user = await db.createUser("badids@example.com");
    const rmQuestion = await addQuestion("A", "Midwifery", "RM");
    await expect(start(user, [rmQuestion])).rejects.toThrow(/invalid_question_set/);
    await expect(start(user, ["00000000-0000-0000-0000-000000000000"])).rejects.toThrow(
      /invalid_question_set/,
    );
    const q = await addQuestion();
    await expect(start(user, [q, q])).rejects.toThrow(/invalid_question_set/);
    await expect(start(user, [])).rejects.toThrow(/invalid_question_set/);
  });

  it("allows only one active session per student", async () => {
    const user = await db.createUser("single@example.com");
    const q = await addQuestion();
    await start(user, [q]);
    await expect(start(user, [q])).rejects.toThrow(/active_session_exists/);
  });

  it("finalises an expired session instead of blocking the next start", async () => {
    const user = await db.createUser("stale@example.com");
    const q = await addQuestion("C");
    const stale = await start(user, [q]);
    await save(user, stale, q, { answer: "C" });
    await db.admin(
      `UPDATE public.exams SET started_at = now() - interval '2 hours', deadline_at = now() - interval '1 hour' WHERE id = $1`,
      [stale],
    );

    const next = await start(user, [q]);
    expect(next).not.toBe(stale);
    expect(await exam(stale)).toMatchObject({
      status: "completed",
      auto_submitted: true,
      correct_count: 1,
    });
  });
});

describe("save_exam_answer", () => {
  it("records answer, first answer, confidence, flag and clamped time", async () => {
    const user = await db.createUser("save@example.com");
    const q = await addQuestion();
    const examId = await start(user, [q]);
    await db.admin(
      `UPDATE public.exams SET started_at = now() - interval '10 minutes' WHERE id = $1`,
      [examId],
    );

    expect(
      await save(user, examId, q, { answer: "B", confidence: "low", flagged: true, timeMs: 4000 }),
    ).toBe("ok");
    let [row] = await answers(examId);
    expect(row).toMatchObject({
      user_answer: "B",
      first_answer: "B",
      answer_changes: 0,
      confidence: "low",
      flagged: true,
      time_spent_ms: 4000,
    });
    expect(row.answered_at).not.toBeNull();

    await save(user, examId, q, { answer: "B" });
    await save(user, examId, q, { answer: "D", timeMs: 999_999_999 });
    [row] = await answers(examId);
    expect(row).toMatchObject({ user_answer: "D", first_answer: "B", answer_changes: 1 });
    expect(Number(row.time_spent_ms)).toBeLessThanOrEqual(10 * 60 * 1000 + 5000); // clamped to the session's age
  });

  it("changes only the fields that are provided", async () => {
    const user = await db.createUser("partial@example.com");
    const q = await addQuestion();
    const examId = await start(user, [q]);
    await save(user, examId, q, { answer: "A", confidence: "high" });
    await save(user, examId, q, { flagged: true });
    const [row] = await answers(examId);
    expect(row).toMatchObject({
      user_answer: "A",
      confidence: "high",
      flagged: true,
      answer_changes: 0,
    });
  });

  it("does not find another student's session or a question outside it", async () => {
    const owner = await db.createUser("owner@example.com");
    const intruder = await db.createUser("intruder@example.com");
    const q = await addQuestion();
    const outsider = await addQuestion();
    const examId = await start(owner, [q]);
    expect(await save(intruder, examId, q, { answer: "A" })).toBe("not_found");
    expect(await save(owner, examId, outsider, { answer: "A" })).toBe("not_found");
    const [row] = await answers(examId);
    expect(row.user_answer).toBeNull();
  });

  it("refuses answers after submission and after the deadline grace", async () => {
    const user = await db.createUser("closed@example.com");
    const q = await addQuestion();
    const examId = await start(user, [q]);
    await db.admin(
      `UPDATE public.exams SET deadline_at = now() - interval '5 seconds' WHERE id = $1`,
      [examId],
    );
    expect(await save(user, examId, q, { answer: "A" })).toBe("ok"); // inside the 10s grace

    await db.admin(
      `UPDATE public.exams SET deadline_at = now() - interval '30 seconds' WHERE id = $1`,
      [examId],
    );
    expect(await save(user, examId, q, { answer: "B" })).toBe("closed");

    const other = await db.createUser("closed2@example.com");
    const q2 = await addQuestion();
    const done = await start(other, [q2]);
    await submit(other, done);
    expect(await save(other, done, q2, { answer: "A" })).toBe("closed");
  });
});

describe("submit_exam_session", () => {
  it("scores on the server from the answer key; unanswered counts as wrong", async () => {
    const user = await db.createUser("score@example.com");
    const [q1, q2, q3, q4] = [
      await addQuestion("A"),
      await addQuestion("B"),
      await addQuestion("C"),
      await addQuestion("D"),
    ];
    const examId = await start(user, [q1, q2, q3, q4]);
    await save(user, examId, q1, { answer: "A" });
    await save(user, examId, q2, { answer: "A" });
    await save(user, examId, q3, { answer: "C" });

    const result = await submit(user, examId);
    expect(result).toMatchObject({
      already_completed: false,
      correct_count: 2,
      total_questions: 4,
      score_pct: 50,
    });
    expect(await exam(examId)).toMatchObject({
      status: "completed",
      correct_count: 2,
      score_pct: "50.00",
      auto_submitted: false,
    });
    const rows = await answers(examId);
    expect(rows.map((r) => r.is_correct)).toEqual([true, false, true, false]);
  });

  it("is idempotent: a second submit changes neither the result nor the statistics", async () => {
    const user = await db.createUser("idem@example.com");
    const q = await addQuestion("A");
    const examId = await start(user, [q]);
    await save(user, examId, q, { answer: "B" });
    const first = await submit(user, examId);
    const completedAt = (await exam(examId)).completed_at;
    const second = await submit(user, examId);
    expect(second).toMatchObject({
      already_completed: true,
      correct_count: first.correct_count,
      score_pct: first.score_pct,
    });
    expect((await exam(examId)).completed_at).toEqual(completedAt);
    expect(await stats(user, q)).toMatchObject({ attempts: 1, misses: 1, correct: 0 });
  });

  it("finalises at the deadline when submitted late", async () => {
    const user = await db.createUser("late@example.com");
    const q = await addQuestion("A");
    const examId = await start(user, [q]);
    await save(user, examId, q, { answer: "A" });
    await db.admin(
      `UPDATE public.exams SET started_at = now() - interval '40 minutes', deadline_at = now() - interval '10 minutes' WHERE id = $1`,
      [examId],
    );
    await submit(user, examId);
    const row = await exam(examId);
    expect(row).toMatchObject({ status: "completed", auto_submitted: true });
    expect(new Date(row.completed_at as string).getTime()).toBe(
      new Date(row.deadline_at as string).getTime(),
    );
    expect(row.time_spent_ms).toBe(30 * 60 * 1000);
  });

  it("refuses to submit another student's session", async () => {
    const owner = await db.createUser("sub-owner@example.com");
    const intruder = await db.createUser("sub-intruder@example.com");
    const q = await addQuestion();
    const examId = await start(owner, [q]);
    await expect(submit(intruder, examId)).rejects.toThrow(/exam_not_found/);
    expect((await exam(examId)).status).toBe("in_progress");
  });

  it("tracks per-question attempts, misses and corrections across sessions", async () => {
    const user = await db.createUser("stats@example.com");
    const q = await addQuestion("A");
    const other = await addQuestion("B");

    let examId = await start(user, [q, other]);
    await save(user, examId, q, { answer: "C" }); // miss
    await submit(user, examId);
    expect(await stats(user, q)).toMatchObject({
      attempts: 1,
      correct: 0,
      misses: 1,
      last_answer: "C",
      unresolved: true,
      corrected_at: null,
    });
    expect(await stats(user, other)).toBeUndefined(); // unanswered questions are not attempts

    examId = await start(user, [q]);
    await save(user, examId, q, { answer: "A" }); // corrected
    await submit(user, examId);
    expect(await stats(user, q)).toMatchObject({
      attempts: 2,
      correct: 1,
      misses: 1,
      unresolved: false,
    });
    expect((await stats(user, q)).corrected_at).not.toBeNull();
    expect((await answers(examId))[0].attempt_number).toBe(2);

    examId = await start(user, [q]);
    await save(user, examId, q, { answer: "D" }); // misses again after correction
    await submit(user, examId);
    expect(await stats(user, q)).toMatchObject({
      attempts: 3,
      correct: 1,
      misses: 2,
      unresolved: true,
    });
  });
});

describe("privileges", () => {
  it("does not let students or anonymous callers run the engine functions", async () => {
    const user = await db.createUser("priv@example.com");
    const q = await addQuestion();
    await expect(
      db.as(
        "authenticated",
        user,
        `SELECT public.start_exam_session($1, 'RN', 'x', 'mixed', 30, '{}', $2::uuid[], '2026-10-06')`,
        [user, `{${q}}`],
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      db.as("authenticated", user, `SELECT public.submit_exam_session($1, $1)`, [user]),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      db.as("anon", null, `SELECT public.save_exam_answer($1, $1, $1, 10, 'A')`, [user]),
    ).rejects.toThrow(/permission denied/i);
  });

  it("lets a student read only their own statistics", async () => {
    const a = await db.createUser("stat-a@example.com");
    const b = await db.createUser("stat-b@example.com");
    const q = await addQuestion("A");
    const examId = await start(a, [q]);
    await save(a, examId, q, { answer: "B" });
    await submit(a, examId);
    expect(
      await db.as("authenticated", a, `SELECT question_id FROM public.user_question_stats`),
    ).toHaveLength(1);
    expect(
      await db.as("authenticated", b, `SELECT question_id FROM public.user_question_stats`),
    ).toHaveLength(0);
    await expect(
      db.as("authenticated", a, `UPDATE public.user_question_stats SET misses = 0`),
    ).rejects.toThrow(/permission denied/i);
  });
});
