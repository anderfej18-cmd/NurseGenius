import type { TestDb } from "./pglite-db";

// Shared set-up for the database tests of Milestone 3: real questions and real sessions, run through
// the same functions the server calls, so the tests see what production would see.

let questionCounter = 0;

export async function addQuestion(
  db: TestDb,
  options: {
    correct?: string;
    topic?: string;
    difficulty?: string | null;
    examType?: "RN" | "RM";
  } = {},
): Promise<string> {
  questionCounter += 1;
  const [row] = await db.admin<{ id: string }>(
    `INSERT INTO public.questions (exam_type, topic, question_text, option_a, option_b, option_c, option_d, correct_answer, difficulty)
     VALUES ($1, $2, $3, 'a', 'b', 'c', 'd', $4, $5) RETURNING id`,
    [
      options.examType ?? "RN",
      options.topic ?? "Pharmacology",
      `Fixture question ${questionCounter}?`,
      options.correct ?? "A",
      options.difficulty ?? null,
    ],
  );
  return row.id;
}

export const serviceCall = <T>(db: TestDb, sql: string, params: unknown[] = []) =>
  db.as<T>("service_role", null, sql, params);

export interface SessionOptions {
  readonly submit?: boolean;
  readonly sessionType?: string;
  readonly confidence?: string;
  readonly timeMs?: number;
  /** The server's idea of "today" for the daily counter. */
  readonly today?: string;
}

/** Starts a session, answers each question (letter, or null to skip) and submits it unless told not to. */
export async function runSession(
  db: TestDb,
  userId: string,
  answers: ReadonlyArray<readonly [string, string | null]>,
  options: SessionOptions = {},
): Promise<string> {
  const ids = answers.map(([id]) => id);
  const [{ id }] = await serviceCall<{ id: string }>(
    db,
    `SELECT public.start_exam_session($1, 'RN', 'All Areas', $2, 30, '{}', $3::uuid[], $4) AS id`,
    [userId, options.sessionType ?? "mixed", `{${ids.join(",")}}`, options.today ?? "2026-10-06"],
  );
  for (const [questionId, letter] of answers) {
    if (letter === null) continue;
    await serviceCall(db, `SELECT public.save_exam_answer($1, $2, $3, 10, $4, $5, null, $6)`, [
      userId,
      id,
      questionId,
      letter,
      options.confidence ?? null,
      options.timeMs ?? null,
    ]);
  }
  if (options.submit !== false) {
    await serviceCall(db, `SELECT public.submit_exam_session($1, $2)`, [userId, id]);
  }
  return id;
}

/** Moves a finished session's answers (and completion) to a given instant, to build history over several days. */
export async function moveSessionTo(db: TestDb, examId: string, at: string): Promise<void> {
  await db.admin(
    `UPDATE public.exam_answers SET answered_at = $2::timestamptz WHERE exam_id = $1`,
    [examId, at],
  );
  await db.admin(
    `UPDATE public.exams SET completed_at = $2::timestamptz, submitted_at = $2::timestamptz WHERE id = $1`,
    [examId, at],
  );
}
