import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addQuestion, serviceCall } from "./fixtures";
import { createTestDb, type TestDb } from "./pglite-db";

// Why each question of a session was chosen (docs/formulas.md section 17): a short code per answer row,
// written by the server right after the session starts, never by the student.
let db: TestDb;
let alice: string;
let bob: string;
let questions: string[];
let aliceExam: string;
let bobExam: string;

const start = async (user: string, ids: string[]) =>
  (
    await serviceCall<{ id: string }>(
      db,
      `SELECT public.start_exam_session($1, 'RN', 'All Areas', 'mixed', 30, '{}', $2::uuid[], '2026-10-09') AS id`,
      [user, `{${ids.join(",")}}`],
    )
  )[0].id;

const record = (user: string, exam: string, reasons: Record<string, string>) =>
  serviceCall<{ n: number }>(db, `SELECT public.record_selection_reasons($1, $2, $3::jsonb) AS n`, [
    user,
    exam,
    JSON.stringify(reasons),
  ]).then((rows) => rows[0].n);

const reasonsOf = (exam: string) =>
  db
    .admin<{
      question_id: string;
      selection_reason: string | null;
    }>(`SELECT question_id, selection_reason FROM public.exam_answers WHERE exam_id = $1`, [exam])
    .then((rows) => Object.fromEntries(rows.map((r) => [r.question_id, r.selection_reason])));

beforeAll(async () => {
  db = await createTestDb();
  [alice, bob] = await Promise.all(
    ["alice", "bob"].map((n) => db.createUser(`${n}-sel@example.com`)),
  );
  questions = [];
  for (let i = 0; i < 4; i += 1) questions.push(await addQuestion(db));
  aliceExam = await start(alice, questions.slice(0, 3));
  bobExam = await start(bob, questions.slice(1, 4));
});
afterAll(() => db.pg.close());

describe("record_selection_reasons", () => {
  it("starts with no reason recorded", async () => {
    expect(Object.values(await reasonsOf(aliceExam))).toEqual([null, null, null]);
  });

  it("records a reason for each of the student's own questions and says how many it set", async () => {
    const n = await record(alice, aliceExam, {
      [questions[0]]: "weak_topic",
      [questions[1]]: "due_review",
    });
    expect(n).toBe(2);
    const reasons = await reasonsOf(aliceExam);
    expect(reasons[questions[0]]).toBe("weak_topic");
    expect(reasons[questions[1]]).toBe("due_review");
    expect(reasons[questions[2]]).toBeNull();
  });

  it("keeps the first reason: recording again does not overwrite", async () => {
    expect(await record(alice, aliceExam, { [questions[0]]: "random" })).toBe(0);
    expect((await reasonsOf(aliceExam))[questions[0]]).toBe("weak_topic");
  });

  it("ignores questions that are not in the session", async () => {
    expect(await record(alice, aliceExam, { [questions[3]]: "random" })).toBe(0);
  });

  it("cannot be used on another student's session", async () => {
    expect(await record(alice, bobExam, { [questions[1]]: "random" })).toBe(0);
    expect((await reasonsOf(bobExam))[questions[1]]).toBeNull();
  });

  it("refuses a code that is not one of the known reasons", async () => {
    await expect(record(alice, aliceExam, { [questions[2]]: "because I said so" })).rejects.toThrow(
      /check|violates|invalid_selection_reason/i,
    );
  });

  it("is for the server only", async () => {
    await expect(
      db.as("authenticated", alice, `SELECT public.record_selection_reasons($1, $2, '{}'::jsonb)`, [
        alice,
        aliceExam,
      ]),
    ).rejects.toThrow(/permission denied/i);
  });

  it("cannot be written by the student directly", async () => {
    await expect(
      db.as(
        "authenticated",
        alice,
        `UPDATE public.exam_answers SET selection_reason = 'random' WHERE exam_id = $1`,
        [aliceExam],
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
