import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./pglite-db";

// Finding L4: before the session engine, the browser wrote exams.score_pct and exam_answers.is_correct,
// so legacy scores cannot be trusted. Completed exams are recomputed from the answer key and marked
// score_verified only when the stored values agree; the leaderboards count verified exams only.
const LAST_LEGACY_MIGRATION = "20261002001620";
const QUESTIONS = 100;

let db: TestDb;
const ids: Record<string, string> = {};

beforeAll(async () => {
  db = await createTestDb({
    seedAfter: {
      migration: LAST_LEGACY_MIGRATION,
      run: async (legacy) => {
        for (const name of ["honest", "forger", "flagforger"]) {
          ids[name] = await legacy.createUser(`${name}@example.com`);
          await legacy.admin(`UPDATE public.profiles SET username = $2 WHERE id = $1`, [
            ids[name],
            name,
          ]);
        }
        await legacy.admin(
          `INSERT INTO public.questions (exam_type, topic, question_text, option_a, option_b, option_c, option_d, correct_answer)
           SELECT 'RN', 'Pharmacology', 'Legacy question ' || n || '?', 'a', 'b', 'c', 'd', 'A'
             FROM generate_series(1, ${QUESTIONS}) n`,
        );

        // An exam of 100 answered questions, `right` of them correct, with the given stored score and flags.
        const legacyExam = async (
          user: string,
          right: number,
          storedScore: number,
          flagAllCorrect: boolean,
        ) => {
          const [exam] = await legacy.admin<{ id: string }>(
            `INSERT INTO public.exams (user_id, exam_type, category, total_questions, time_limit_minutes, status, started_at, completed_at, score_pct)
             VALUES ($1, 'RN', 'All Areas', ${QUESTIONS}, 60, 'completed', now() - interval '1 minute', now(), $2) RETURNING id`,
            [user, storedScore],
          );
          await legacy.admin(
            `INSERT INTO public.exam_answers (exam_id, question_id, position, user_answer, is_correct)
             SELECT $1, q.id, row_number() OVER (ORDER BY q.question_text) - 1,
                    CASE WHEN row_number() OVER (ORDER BY q.question_text) <= $2 THEN 'A' ELSE 'B' END,
                    CASE WHEN $3::boolean THEN true
                         ELSE row_number() OVER (ORDER BY q.question_text) <= $2 END
               FROM public.questions q`,
            [exam.id, right, flagAllCorrect],
          );
          return exam.id;
        };
        ids.honestExam = await legacyExam(ids.honest, 80, 80, false);
        ids.forgedScore = await legacyExam(ids.forger, 10, 100, false); // stored score does not match the key
        ids.forgedFlags = await legacyExam(ids.flagforger, 10, 10, true); // score matches, flags say all correct
      },
    },
  });
});
afterAll(() => db.pg.close());

const verified = async (examId: string) =>
  (
    await db.admin<{ score_verified: boolean; score_pct: string }>(
      `SELECT score_verified, score_pct::text FROM public.exams WHERE id = $1`,
      [examId],
    )
  )[0];

describe("legacy exams after the score-integrity migration", () => {
  it("verifies an exam whose stored score and flags match the answer key", async () => {
    expect((await verified(ids.honestExam)).score_verified).toBe(true);
  });

  it("does not verify an exam whose stored score disagrees with the key, and keeps the row as it was", async () => {
    expect(await verified(ids.forgedScore)).toEqual({ score_verified: false, score_pct: "100.00" });
  });

  it("does not verify an exam whose is_correct flags disagree with the key", async () => {
    expect((await verified(ids.forgedFlags)).score_verified).toBe(false);
  });

  it("does not delete or rewrite any legacy answer", async () => {
    const [count] = await db.admin<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.exam_answers WHERE exam_id = ANY($1)`,
      [[ids.honestExam, ids.forgedScore, ids.forgedFlags]],
    );
    expect(count.n).toBe(QUESTIONS * 3);
    const [flags] = await db.admin<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.exam_answers WHERE exam_id = $1 AND is_correct`,
      [ids.forgedFlags],
    );
    expect(flags.n).toBe(QUESTIONS);
  });
});

describe("the leaderboards", () => {
  const daily = () =>
    db.as<{ username: string; correct: number }>(
      "service_role",
      null,
      `SELECT * FROM public.get_daily_leaderboard()`,
    );

  it("list only students whose exams are verified", async () => {
    const names = (await daily()).map((r) => r.username);
    expect(names).toContain("honest");
    expect(names).not.toContain("forger");
    expect(names).not.toContain("flagforger");
  });

  it("count correct answers from verified exams", async () => {
    const row = (await daily()).find((r) => r.username === "honest");
    expect(row?.correct).toBe(80);
  });
});

describe("new sessions", () => {
  it("are marked verified when finalised by the server, and not before", async () => {
    const [student] = [ids.honest];
    const [started] = await db.admin<{ id: string }>(
      `INSERT INTO public.exams (user_id, exam_type, category, total_questions, time_limit_minutes, deadline_at)
       VALUES ($1, 'RN', 'All Areas', 1, 30, now() + interval '30 minutes') RETURNING id`,
      [student],
    );
    expect((await verified(started.id)).score_verified).toBe(false);
    await db.admin(`SELECT app_private.finalize_exam($1, $2)`, [started.id, student]);
    expect((await verified(started.id)).score_verified).toBe(true);
  });

  it("cannot be marked verified by a student", async () => {
    await expect(
      db.as(
        "authenticated",
        ids.forger,
        `UPDATE public.exams SET score_verified = true WHERE id = $1`,
        [ids.forgedScore],
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
