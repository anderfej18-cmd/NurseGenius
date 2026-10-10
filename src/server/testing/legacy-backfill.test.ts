import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./pglite-db";

// Legacy data is created before the Milestone 1 migrations run, then the migrations upgrade it.
const LAST_LEGACY_MIGRATION = "20261002001620";

let db: TestDb;
const ids: Record<string, string> = {};

beforeAll(async () => {
  db = await createTestDb({
    seedAfter: {
      migration: LAST_LEGACY_MIGRATION,
      run: async (legacy) => {
        ids.alice = await legacy.createUser("alice-legacy@example.com");
        ids.bob = await legacy.createUser("bob-legacy@example.com");
        const insertQuestion = async (text: string, correct: string, topic: string) =>
          (
            await legacy.admin<{ id: string }>(
              `INSERT INTO public.questions (exam_type, topic, question_text, option_a, option_b, option_c, option_d, correct_answer)
             VALUES ('RN', $1, $2, 'a', 'b', 'c', 'd', $3) RETURNING id`,
              [topic, text, correct],
            )
          )[0].id;
        ids.q1 = await insertQuestion("Legacy question one?", "A", "Pharmacology");
        ids.q2 = await insertQuestion("Legacy question two?", "B", "Anatomy");

        const insertExam = async (
          user: string,
          status: string,
          startedAgo: string,
          completedAgo: string | null,
          score: number | null,
        ) =>
          (
            await legacy.admin<{ id: string }>(
              `INSERT INTO public.exams (user_id, exam_type, category, total_questions, time_limit_minutes, status, started_at, completed_at, score_pct)
             VALUES ($1, 'RN', 'All Areas', 2, 30, $2, now() - $3::interval, now() - $4::interval, $5) RETURNING id`,
              [user, status, startedAgo, completedAgo, score],
            )
          )[0].id;
        const insertAnswer = (
          exam: string,
          q: string,
          position: number,
          answer: string | null,
          isCorrect: boolean | null,
        ) =>
          legacy.admin(
            `INSERT INTO public.exam_answers (exam_id, question_id, position, user_answer, is_correct) VALUES ($1, $2, $3, $4, $5)`,
            [exam, q, position, answer, isCorrect],
          );

        // Alice: first exam misses q1 (a forged is_correct=true must be ignored), second corrects it.
        ids.e1 = await insertExam(ids.alice, "completed", "3 days", "3 days", 100);
        await insertAnswer(ids.e1, ids.q1, 0, "C", true);
        await insertAnswer(ids.e1, ids.q2, 1, "B", true);
        ids.e2 = await insertExam(ids.alice, "completed", "2 days", "2 days", 50);
        await insertAnswer(ids.e2, ids.q1, 0, "A", true);
        await insertAnswer(ids.e2, ids.q2, 1, null, null);

        // Abandoned in-progress sessions: Bob has two (one long expired, one recent and still open).
        ids.stale = await insertExam(ids.bob, "in_progress", "5 hours", null, null);
        await insertAnswer(ids.stale, ids.q1, 0, "A", null);
        await insertAnswer(ids.stale, ids.q2, 1, "B", null);
        ids.open = await insertExam(ids.bob, "in_progress", "10 minutes", null, null);
        await insertAnswer(ids.open, ids.q1, 0, null, null);
        ids.open2 = await insertExam(ids.bob, "in_progress", "5 minutes", null, null);
        await insertAnswer(ids.open2, ids.q2, 0, null, null);
      },
    },
  });
});
afterAll(() => db.pg.close());

describe("legacy data after the Milestone 1 migrations", () => {
  it("backfills statistics from the answer key, not from stored is_correct flags", async () => {
    const [q1] = await db.admin<Record<string, unknown>>(
      `SELECT * FROM public.user_question_stats WHERE user_id = $1 AND question_id = $2`,
      [ids.alice, ids.q1],
    );
    expect(q1).toMatchObject({
      attempts: 2,
      correct: 1,
      misses: 1,
      last_answer: "A",
      unresolved: false,
    });
    expect(q1.corrected_at).not.toBeNull();

    const [q2] = await db.admin<Record<string, unknown>>(
      `SELECT * FROM public.user_question_stats WHERE user_id = $1 AND question_id = $2`,
      [ids.alice, ids.q2],
    );
    expect(q2).toMatchObject({ attempts: 1, correct: 1, misses: 0 }); // the unanswered second attempt is not counted
  });

  it("numbers legacy attempts and snapshots topics", async () => {
    const rows = await db.admin<Record<string, unknown>>(
      `SELECT ea.question_id, ea.attempt_number, ea.topic, ea.first_answer
         FROM public.exam_answers ea JOIN public.exams e ON e.id = ea.exam_id
        WHERE ea.exam_id IN ($1, $2) AND ea.user_answer IS NOT NULL
        ORDER BY e.completed_at, ea.position`,
      [ids.e1, ids.e2],
    );
    const q1Rows = rows.filter((r) => r.question_id === ids.q1).map((r) => r.attempt_number);
    expect(q1Rows).toEqual([1, 2]);
    expect(rows.every((r) => r.topic !== null && r.first_answer !== null)).toBe(true);
  });

  it("keeps legacy exam scores untouched", async () => {
    const [e1] = await db.admin<{ score_pct: string }>(
      `SELECT score_pct::text FROM public.exams WHERE id = $1`,
      [ids.e1],
    );
    expect(e1.score_pct).toBe("100.00");
  });

  it("finalises abandoned sessions so only one active session per student remains", async () => {
    const [stale] = await db.admin<Record<string, unknown>>(
      `SELECT * FROM public.exams WHERE id = $1`,
      [ids.stale],
    );
    expect(stale).toMatchObject({ status: "completed", auto_submitted: true, correct_count: 2 });
    const open = await db.admin<{ id: string; status: string }>(
      `SELECT id, status FROM public.exams WHERE user_id = $1 AND status = 'in_progress'`,
      [ids.bob],
    );
    expect(open.map((r) => r.id)).toEqual([ids.open2]); // the most recent one survives
  });

  it("enforces the one-active-session rule in the database", async () => {
    await expect(
      db.admin(
        `INSERT INTO public.exams (user_id, exam_type, category, total_questions, time_limit_minutes, deadline_at)
                VALUES ($1, 'RN', 'x', 1, 30, now() + interval '1 hour')`,
        [ids.bob],
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });
});
