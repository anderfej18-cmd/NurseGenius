import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addQuestion, serviceCall } from "./fixtures";
import { createTestDb, type TestDb } from "./pglite-db";

let db: TestDb;
let admin: string;
let student: string;
let questionId: string;

beforeAll(async () => {
  db = await createTestDb();
  admin = await db.createUser("admin-ac@example.com");
  student = await db.createUser("student-ac@example.com");
  await db.admin(`INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'admin')`, [admin]);
  questionId = await addQuestion(db, { correct: "A" });
});
afterAll(() => db.pg.close());

const newQuestion = `INSERT INTO public.questions (exam_type, topic, question_text, option_a, option_b, option_c, option_d, correct_answer)
  VALUES ('RN', 'T', 'Q?', 'a', 'b', 'c', 'd', 'A')`;

describe("question writes are closed to every client role, admins included", () => {
  it("is an admin in the database, so the closing is not just a missing role", async () => {
    const [row] = await db.as<{ ok: boolean }>(
      "authenticated",
      admin,
      `SELECT public.is_any_admin($1) AS ok`,
      [admin],
    );
    expect(row.ok).toBe(true);
  });

  it.each([
    ["insert", newQuestion],
    ["update", `UPDATE public.questions SET correct_answer = 'B'`],
    ["delete", `DELETE FROM public.questions`],
  ])("denies an admin's browser an %s", async (_what, sql) => {
    await expect(db.as("authenticated", admin, sql)).rejects.toThrow(/permission denied/i);
  });

  it.each([
    ["insert", newQuestion],
    ["update", `UPDATE public.questions SET status = 'retired'`],
    ["delete", `DELETE FROM public.questions`],
  ])("denies a student's browser and an anonymous one an %s", async (_what, sql) => {
    await expect(db.as("authenticated", student, sql)).rejects.toThrow(/permission denied/i);
    await expect(db.as("anon", null, sql)).rejects.toThrow(/permission denied/i);
  });

  it("changed nothing", async () => {
    const rows = await db.admin<{ status: string; correct_answer: string }>(
      `SELECT status, correct_answer FROM public.questions WHERE id = $1`,
      [questionId],
    );
    expect(rows).toEqual([{ status: "active", correct_answer: "A" }]);
  });
});

describe("the server's service role still manages the bank", () => {
  it("inserts, retires, restores and updates questions and subtopics", async () => {
    const [{ id }] = await serviceCall<{ id: string }>(
      db,
      `${newQuestion.replace("VALUES", "VALUES")} RETURNING id`,
    );
    await serviceCall(db, `UPDATE public.questions SET status = 'retired' WHERE id = $1`, [id]);
    await serviceCall(db, `UPDATE public.questions SET status = 'active' WHERE id = $1`, [id]);
    const [subtopic] = await serviceCall<{ id: string }>(
      db,
      `INSERT INTO public.subtopics (exam_type, topic, name) VALUES ('RN', 'T', 'Opioids') RETURNING id`,
    );
    await serviceCall(db, `UPDATE public.questions SET subtopic_id = $1 WHERE id = $2`, [
      subtopic.id,
      id,
    ]);
    await serviceCall(db, `DELETE FROM public.subtopics WHERE id = $1`, [subtopic.id]);
    const [row] = await serviceCall<{ subtopic_id: string | null; status: string }>(
      db,
      `SELECT subtopic_id, status FROM public.questions WHERE id = $1`,
      [id],
    );
    expect(row).toEqual({ subtopic_id: null, status: "active" });
  });
});

describe("reading is unchanged", () => {
  it("still shows a student active questions without the answer key", async () => {
    const rows = await db.as(
      "authenticated",
      student,
      `SELECT id, question_text FROM public.questions`,
    );
    expect(rows.length).toBeGreaterThan(0);
    await expect(
      db.as("authenticated", student, `SELECT correct_answer FROM public.questions`),
    ).rejects.toThrow(/permission denied/i);
  });

  it("still lets an admin's browser read the catalog columns, retired questions included", async () => {
    await db.admin(`UPDATE public.questions SET status = 'retired' WHERE id = $1`, [questionId]);
    const rows = await db.as<{ id: string }>(
      "authenticated",
      admin,
      `SELECT id FROM public.questions WHERE id = $1`,
      [questionId],
    );
    expect(rows).toHaveLength(1);
    await db.admin(`UPDATE public.questions SET status = 'active' WHERE id = $1`, [questionId]);
  });
});
