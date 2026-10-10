import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./pglite-db";

let db: TestDb;
let alice: string;
let bob: string;
let admin: string;
let questionId: string;

beforeAll(async () => {
  db = await createTestDb();
  alice = await db.createUser("alice-br@example.com");
  bob = await db.createUser("bob-br@example.com");
  admin = await db.createUser("admin-br@example.com");
  await db.admin(`INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'admin')`, [admin]);
  [{ id: questionId }] = await db.admin<{ id: string }>(
    `INSERT INTO public.questions (exam_type, topic, question_text, option_a, option_b, option_c, option_d, correct_answer)
     VALUES ('RN', 'Anatomy', 'Q?', 'a', 'b', 'c', 'd', 'A') RETURNING id`,
  );
});
afterAll(() => db.pg.close());

describe("bookmarks", () => {
  it("allows one bookmark per student and question", async () => {
    await db.admin(`INSERT INTO public.bookmarks (user_id, question_id) VALUES ($1, $2)`, [
      alice,
      questionId,
    ]);
    await expect(
      db.admin(`INSERT INTO public.bookmarks (user_id, question_id) VALUES ($1, $2)`, [
        alice,
        questionId,
      ]),
    ).rejects.toThrow(/duplicate key/i);
    await db.admin(`INSERT INTO public.bookmarks (user_id, question_id) VALUES ($1, $2)`, [
      bob,
      questionId,
    ]);
  });

  it("shows students only their own bookmarks and gives them no write access", async () => {
    expect(await db.as("authenticated", alice, `SELECT id FROM public.bookmarks`)).toHaveLength(1);
    await expect(
      db.as(
        "authenticated",
        alice,
        `INSERT INTO public.bookmarks (user_id, question_id) VALUES ($1, $2)`,
        [bob, questionId],
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(db.as("authenticated", alice, `DELETE FROM public.bookmarks`)).rejects.toThrow(
      /permission denied/i,
    );
  });

  it("caps the note length", async () => {
    await expect(
      db.admin(`UPDATE public.bookmarks SET note = $1 WHERE user_id = $2`, [
        "x".repeat(501),
        alice,
      ]),
    ).rejects.toThrow(/check constraint/i);
  });
});

describe("question reports", () => {
  it("allows only one open report per student, question and reason", async () => {
    await db.admin(
      `INSERT INTO public.question_reports (question_id, reporter_id, reason) VALUES ($1, $2, 'typo')`,
      [questionId, alice],
    );
    await expect(
      db.admin(
        `INSERT INTO public.question_reports (question_id, reporter_id, reason) VALUES ($1, $2, 'typo')`,
        [questionId, alice],
      ),
    ).rejects.toThrow(/duplicate key/i);
    await db.admin(
      `INSERT INTO public.question_reports (question_id, reporter_id, reason) VALUES ($1, $2, 'unclear')`,
      [questionId, alice],
    );
  });

  it("rejects unknown reasons and inconsistent resolution state", async () => {
    await expect(
      db.admin(
        `INSERT INTO public.question_reports (question_id, reporter_id, reason) VALUES ($1, $2, 'rude')`,
        [questionId, bob],
      ),
    ).rejects.toThrow(/check constraint/i);
    await expect(
      db.admin(
        `INSERT INTO public.question_reports (question_id, reporter_id, reason, status) VALUES ($1, $2, 'typo', 'resolved')`,
        [questionId, bob],
      ),
    ).rejects.toThrow(/check constraint/i);
  });

  it("lets a student read only their own reports and admins read all", async () => {
    await db.admin(
      `INSERT INTO public.question_reports (question_id, reporter_id, reason) VALUES ($1, $2, 'duplicate')`,
      [questionId, bob],
    );
    expect(
      await db.as("authenticated", alice, `SELECT id FROM public.question_reports`),
    ).toHaveLength(2);
    expect(
      await db.as("authenticated", bob, `SELECT id FROM public.question_reports`),
    ).toHaveLength(1);
    expect(
      await db.as("authenticated", admin, `SELECT id FROM public.question_reports`),
    ).toHaveLength(3);
  });

  it("gives students no write access, so they cannot resolve or alter reports", async () => {
    await expect(
      db.as("authenticated", alice, `UPDATE public.question_reports SET status = 'resolved'`),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      db.as(
        "authenticated",
        alice,
        `INSERT INTO public.question_reports (question_id, reporter_id, reason) VALUES ($1, $2, 'typo')`,
        [questionId, alice],
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
