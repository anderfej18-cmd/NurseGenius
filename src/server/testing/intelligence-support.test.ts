import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./pglite-db";

let db: TestDb;
let counter = 0;

async function addQuestion(
  correct = "A",
  topic = "Pharmacology",
  difficulty: string | null = null,
) {
  counter += 1;
  const [row] = await db.admin<{ id: string }>(
    `INSERT INTO public.questions (exam_type, topic, question_text, option_a, option_b, option_c, option_d, correct_answer, difficulty)
     VALUES ('RN', $1, $2, 'a', 'b', 'c', 'd', $3, $4) RETURNING id`,
    [topic, `Support question ${counter}?`, correct, difficulty],
  );
  return row.id;
}

const call = <T>(sql: string, params: unknown[] = []) =>
  db.as<T>("service_role", null, sql, params);

/** Runs a real session: start, answer, optionally submit. `answers` maps question id to the letter chosen (or null to skip). */
async function session(
  userId: string,
  answers: Array<[string, string | null]>,
  options: { submit?: boolean; confidence?: string; timeMs?: number } = {},
) {
  const ids = answers.map(([id]) => id);
  const [{ id }] = await call<{ id: string }>(
    `SELECT public.start_exam_session($1, 'RN', 'All Areas', 'mixed', 30, '{}', $2::uuid[], '2026-10-06') AS id`,
    [userId, `{${ids.join(",")}}`],
  );
  for (const [questionId, letter] of answers) {
    if (letter === null) continue;
    await call(`SELECT public.save_exam_answer($1, $2, $3, 10, $4, $5, null, $6)`, [
      userId,
      id,
      questionId,
      letter,
      options.confidence ?? null,
      options.timeMs ?? null,
    ]);
  }
  if (options.submit !== false)
    await call(`SELECT public.submit_exam_session($1, $2)`, [userId, id]);
  return id;
}

const attempts = (
  userId: string,
  args: { since?: string | null; questionIds?: string[] | null; limit?: number } = {},
) =>
  call<Record<string, unknown>>(
    `SELECT * FROM public.get_student_attempts($1, $2::timestamptz, $3::uuid[], $4)`,
    [
      userId,
      args.since ?? null,
      args.questionIds ? `{${args.questionIds.join(",")}}` : null,
      args.limit ?? 5000,
    ],
  );

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(() => db.pg.close());

describe("get_student_attempts", () => {
  it("returns answered attempts of completed sessions with the facts the engines need", async () => {
    const user = await db.createUser("attempts@example.com");
    const q1 = await addQuestion("A", "Pharmacology", "hard");
    const q2 = await addQuestion("B", "Anatomy");
    const sessionId = await session(
      user,
      [
        [q1, "A"],
        [q2, "C"],
      ],
      { confidence: "high", timeMs: 1000 },
    );

    const rows = await attempts(user);
    expect(rows).toHaveLength(2);
    const byQuestion = Object.fromEntries(rows.map((r) => [r.question_id as string, r]));
    expect(byQuestion[q1]).toMatchObject({
      topic: "Pharmacology",
      exam_type: "RN",
      session_id: sessionId,
      session_type: "mixed",
      correct: true,
      difficulty: "hard",
      confidence: "high",
    });
    expect(byQuestion[q2]).toMatchObject({ topic: "Anatomy", correct: false, difficulty: null });
    expect(byQuestion[q1].answered_at).not.toBeNull();
    expect(Number(byQuestion[q1].time_spent_ms)).toBeLessThanOrEqual(1000);
  });

  it("leaves out unanswered questions and sessions that are still running", async () => {
    const user = await db.createUser("partial-attempts@example.com");
    const q1 = await addQuestion();
    const q2 = await addQuestion();
    await session(user, [
      [q1, "A"],
      [q2, null],
    ]);
    expect(await attempts(user)).toHaveLength(1);

    const q3 = await addQuestion();
    await session(user, [[q3, "A"]], { submit: false });
    expect(await attempts(user)).toHaveLength(1);
  });

  it("works out correctness from the answer key, not from a stored flag", async () => {
    const user = await db.createUser("forged@example.com");
    const q = await addQuestion("A");
    const id = await session(user, [[q, "B"]]);
    await db.admin(`UPDATE public.exam_answers SET is_correct = true WHERE exam_id = $1`, [id]);
    expect((await attempts(user))[0].correct).toBe(false);
  });

  it("never returns another student's attempts", async () => {
    const alice = await db.createUser("alice-att@example.com");
    const bob = await db.createUser("bob-att@example.com");
    const q = await addQuestion();
    await session(alice, [[q, "A"]]);
    expect(await attempts(bob)).toEqual([]);
  });

  it("lists the newest first and honours the period, question and limit filters", async () => {
    const user = await db.createUser("filters@example.com");
    const [qa, qb, qc] = [await addQuestion(), await addQuestion(), await addQuestion()];
    const id = await session(user, [
      [qa, "A"],
      [qb, "A"],
      [qc, "A"],
    ]);
    await db.admin(
      `UPDATE public.exam_answers SET answered_at = now() - make_interval(days => position * 10) WHERE exam_id = $1`,
      [id],
    );

    const all = await attempts(user);
    expect(all.map((r) => r.question_id)).toEqual([qa, qb, qc]); // positions 0, 1, 2 -> newest first

    expect(await attempts(user, { limit: 2 })).toHaveLength(2);
    expect((await attempts(user, { questionIds: [qb] })).map((r) => r.question_id)).toEqual([qb]);
    const since = await db.admin<{ t: string }>(`SELECT (now() - interval '15 days')::text AS t`);
    expect((await attempts(user, { since: since[0].t })).map((r) => r.question_id)).toEqual([
      qa,
      qb,
    ]);
  });

  it("falls back to the completion time when an answer has no timestamp", async () => {
    const user = await db.createUser("legacy-ts@example.com");
    const q = await addQuestion();
    const id = await session(user, [[q, "A"]]);
    await db.admin(`UPDATE public.exam_answers SET answered_at = NULL WHERE exam_id = $1`, [id]);
    const [row] = await attempts(user);
    const [exam] = await db.admin<{ completed_at: string }>(
      `SELECT completed_at FROM public.exams WHERE id = $1`,
      [id],
    );
    expect(new Date(row.answered_at as string).getTime()).toBe(
      new Date(exam.completed_at).getTime(),
    );
  });

  it("caps the page size", async () => {
    const user = await db.createUser("cap@example.com");
    const q = await addQuestion();
    await session(user, [[q, "A"]]);
    expect(await attempts(user, { limit: 0 })).toHaveLength(1); // clamped up to 1
    expect(await attempts(user, { limit: -5 })).toHaveLength(1);
  });
});

describe("get_question_difficulty_stats", () => {
  it("counts attempts and correct answers across all students, finished sessions only", async () => {
    const a = await db.createUser("diff-a@example.com");
    const b = await db.createUser("diff-b@example.com");
    const c = await db.createUser("diff-c@example.com");
    const q = await addQuestion("A");
    await session(a, [[q, "A"]]);
    await session(b, [[q, "B"]]);
    await session(c, [[q, "A"]], { submit: false }); // still running: not counted

    const rows = await call<{ question_id: string; attempts: number; correct: number }>(
      `SELECT * FROM public.get_question_difficulty_stats($1::uuid[])`,
      [`{${q}}`],
    );
    expect(rows).toEqual([{ question_id: q, attempts: 2, correct: 1 }]);
  });

  it("returns nothing for questions nobody answered, and refuses an oversized request", async () => {
    const q = await addQuestion();
    expect(
      await call(`SELECT * FROM public.get_question_difficulty_stats($1::uuid[])`, [`{${q}}`]),
    ).toEqual([]);
    await expect(
      call(
        `SELECT * FROM public.get_question_difficulty_stats(array_fill('00000000-0000-0000-0000-000000000000'::uuid, ARRAY[20001]))`,
      ),
    ).rejects.toThrow(/too_many_questions/);
  });
});

describe("apply_review_states", () => {
  const state = (questionId: string, overrides: Record<string, unknown> = {}) => ({
    question_id: questionId,
    next_review_at: "2026-10-10T09:00:00Z",
    review_count: 2,
    last_reviewed_at: "2026-10-04T09:00:00Z",
    review_status: "review",
    interval_days: 6,
    ease: 2.5,
    ...overrides,
  });
  const apply = (userId: string, states: unknown[]) =>
    call<{ n: number }>(`SELECT public.apply_review_states($1, $2::jsonb) AS n`, [
      userId,
      JSON.stringify(states),
    ]);
  const stats = (userId: string, questionId: string) =>
    db
      .admin<
        Record<string, unknown>
      >(`SELECT * FROM public.user_question_stats WHERE user_id = $1 AND question_id = $2`, [userId, questionId])
      .then((r) => r[0]);

  it("writes the review fields of the caller's own statistics and reports how many rows changed", async () => {
    const user = await db.createUser("review-a@example.com");
    const q = await addQuestion("A");
    await session(user, [[q, "B"]]);
    expect(await apply(user, [state(q)])).toEqual([{ n: 1 }]);
    expect(await stats(user, q)).toMatchObject({
      review_count: 2,
      review_status: "review",
      interval_days: "6.00",
      ease: "2.50",
      attempts: 1,
    });
  });

  it("does not touch another student's statistics for the same question", async () => {
    const alice = await db.createUser("review-alice@example.com");
    const bob = await db.createUser("review-bob@example.com");
    const q = await addQuestion("A");
    await session(alice, [[q, "B"]]);
    await session(bob, [[q, "B"]]);
    expect(await apply(alice, [state(q, { review_count: 9 })])).toEqual([{ n: 1 }]);
    expect(await stats(bob, q)).toMatchObject({ review_count: 0, review_status: "new" });
  });

  it("skips questions the student has no statistics for", async () => {
    const user = await db.createUser("review-missing@example.com");
    const stranger = await addQuestion();
    expect(await apply(user, [state(stranger)])).toEqual([{ n: 0 }]);
  });

  it("rejects values the schema does not allow, and an oversized batch", async () => {
    const user = await db.createUser("review-invalid@example.com");
    const q = await addQuestion("A");
    await session(user, [[q, "B"]]);
    await expect(apply(user, [state(q, { review_status: "genius" })])).rejects.toThrow(
      /check constraint/i,
    );
    await expect(apply(user, [state(q, { ease: -1 })])).rejects.toThrow(/check constraint/i);
    await expect(
      apply(
        user,
        Array.from({ length: 1001 }, () => state(q)),
      ),
    ).rejects.toThrow(/too_many_states/);
  });
});

describe("review_stale", () => {
  it("flags a schedule that has not caught up with the attempts, and clears once it has", async () => {
    const user = await db.createUser("stale@example.com");
    const q = await addQuestion("A");
    await session(user, [[q, "B"]]);
    const flag = async () =>
      (
        await db.admin<{ review_stale: boolean }>(
          `SELECT review_stale FROM public.user_question_stats WHERE user_id = $1 AND question_id = $2`,
          [user, q],
        )
      )[0].review_stale;
    expect(await flag()).toBe(true); // one attempt, no review recorded yet

    await call(`SELECT public.apply_review_states($1, $2::jsonb)`, [
      user,
      JSON.stringify([
        {
          question_id: q,
          next_review_at: "2026-10-10T09:00:00Z",
          review_count: 1,
          last_reviewed_at: "2026-10-09T09:00:00Z",
          review_status: "learning",
          interval_days: 1,
          ease: 2.5,
        },
      ]),
    ]);
    expect(await flag()).toBe(false);

    await session(user, [[q, "A"]]); // a second attempt makes it stale again
    expect(await flag()).toBe(true);
  });
});

describe("privileges", () => {
  it("lets only the service role run the intelligence functions", async () => {
    const user = await db.createUser("intel-priv@example.com");
    for (const role of ["authenticated", "anon"] as const) {
      await expect(
        db.as(role, user, `SELECT * FROM public.get_student_attempts($1)`, [user]),
      ).rejects.toThrow(/permission denied/i);
      await expect(
        db.as(role, user, `SELECT * FROM public.get_question_difficulty_stats('{}'::uuid[])`),
      ).rejects.toThrow(/permission denied/i);
      await expect(
        db.as(role, user, `SELECT public.apply_review_states($1, '[]'::jsonb)`, [user]),
      ).rejects.toThrow(/permission denied/i);
    }
  });
});
