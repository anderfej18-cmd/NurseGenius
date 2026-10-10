import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./pglite-db";

const LAST_LEGACY_MIGRATION = "20261002001620";

async function seed(db: TestDb, legacy = false) {
  const alice = await db.createUser("alice@example.com");
  const bob = await db.createUser("bob@example.com");
  const [question] = await db.admin<{ id: string }>(
    `INSERT INTO public.questions (exam_type, topic, question_text, option_a, option_b, option_c, option_d, correct_answer, rationale)
     VALUES ('RN', 'Pharmacology', 'Which drug class lowers heart rate?', 'Beta blocker', 'Diuretic', 'Statin', 'Antacid', 'A', 'Beta blockers slow the heart.')
     RETURNING id`,
  );
  const [exam] = await db.admin<{ id: string }>(
    legacy
      ? `INSERT INTO public.exams (user_id, exam_type, category, total_questions, time_limit_minutes)
         VALUES ($1, 'RN', 'All Areas', 1, 30) RETURNING id`
      : `INSERT INTO public.exams (user_id, exam_type, category, total_questions, time_limit_minutes, deadline_at)
         VALUES ($1, 'RN', 'All Areas', 1, 30, now() + interval '30 minutes') RETURNING id`,
    [alice],
  );
  await db.admin(
    `INSERT INTO public.exam_answers (exam_id, question_id, position) VALUES ($1, $2, 0)`,
    [exam.id, question.id],
  );
  return { alice, bob, questionId: question.id, examId: exam.id };
}

describe("baseline schema (before the lockdown migrations)", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb({ upTo: LAST_LEGACY_MIGRATION });
  });
  afterAll(() => db.pg.close());

  it("is exploitable: a student can self-upgrade, forge a score and read the answer key", async () => {
    const { alice, examId } = await seed(db, true);
    await db.as(
      "authenticated",
      alice,
      `UPDATE public.profiles SET tier = 'scholar' WHERE id = $1`,
      [alice],
    );
    await db.as(
      "authenticated",
      alice,
      `UPDATE public.exams SET status='completed', score_pct = 100 WHERE id = $1`,
      [examId],
    );
    const keys = await db.as(
      "authenticated",
      alice,
      `SELECT correct_answer, rationale FROM public.questions`,
    );
    expect(keys).toHaveLength(1);
    const [profile] = await db.admin<{ tier: string }>(
      `SELECT tier FROM public.profiles WHERE id = $1`,
      [alice],
    );
    expect(profile.tier).toBe("scholar");
  });
});

describe("security lockdown", () => {
  let db: TestDb;
  let alice: string;
  let bob: string;
  let examId: string;
  beforeAll(async () => {
    db = await createTestDb();
    ({ alice, bob, examId } = await seed(db));
  });
  afterAll(() => db.pg.close());

  describe("profiles", () => {
    it("lets a student edit their own onboarding fields", async () => {
      const rows = await db.as(
        "authenticated",
        alice,
        `UPDATE public.profiles SET first_name = 'Alice', username = 'alice', exam_preference = 'RN', onboarded = true WHERE id = $1 RETURNING id`,
        [alice],
      );
      expect(rows).toHaveLength(1);
    });

    it.each([
      "tier = 'scholar'",
      "expiry_date = now() + interval '90 days'",
      "questions_today = 0",
      "last_question_date = NULL",
    ])("rejects a student changing %s", async (assignment) => {
      await expect(
        db.as("authenticated", alice, `UPDATE public.profiles SET ${assignment} WHERE id = $1`, [
          alice,
        ]),
      ).rejects.toThrow(/permission denied/i);
    });

    it("does not let a student edit someone else's profile", async () => {
      const rows = await db.as(
        "authenticated",
        alice,
        `UPDATE public.profiles SET first_name = 'Hacked' WHERE id = $1 RETURNING id`,
        [bob],
      );
      expect(rows).toHaveLength(0);
    });
  });

  describe("questions", () => {
    it("shows students the question text and options of active questions", async () => {
      const rows = await db.as(
        "authenticated",
        alice,
        `SELECT question_text, option_a, topic FROM public.questions`,
      );
      expect(rows).toHaveLength(1);
    });

    it.each(["correct_answer", "rationale", "*"])("denies students reading %s", async (column) => {
      await expect(
        db.as("authenticated", alice, `SELECT ${column} FROM public.questions`),
      ).rejects.toThrow(/permission denied/i);
    });

    it("hides retired questions from students", async () => {
      await db.admin(`UPDATE public.questions SET status = 'retired'`);
      const rows = await db.as("authenticated", alice, `SELECT id FROM public.questions`);
      expect(rows).toHaveLength(0);
      await db.admin(`UPDATE public.questions SET status = 'active'`);
    });
  });

  describe("exams and answers", () => {
    it("lets a student read their own exam but not another student's", async () => {
      expect(await db.as("authenticated", alice, `SELECT id FROM public.exams`)).toHaveLength(1);
      expect(await db.as("authenticated", bob, `SELECT id FROM public.exams`)).toHaveLength(0);
      expect(await db.as("authenticated", bob, `SELECT id FROM public.exam_answers`)).toHaveLength(
        0,
      );
    });

    it("rejects a student writing score data directly", async () => {
      await expect(
        db.as(
          "authenticated",
          alice,
          `UPDATE public.exams SET status = 'completed', score_pct = 100, correct_count = 1 WHERE id = $1`,
          [examId],
        ),
      ).rejects.toThrow(/permission denied/i);
      await expect(
        db.as(
          "authenticated",
          alice,
          `UPDATE public.exam_answers SET is_correct = true WHERE exam_id = $1`,
          [examId],
        ),
      ).rejects.toThrow(/permission denied/i);
    });

    it("rejects a student creating or deleting sessions directly", async () => {
      await expect(
        db.as(
          "authenticated",
          alice,
          `INSERT INTO public.exams (user_id, exam_type, category, total_questions, time_limit_minutes, deadline_at) VALUES ($1, 'RN', 'x', 1, 30, now())`,
          [alice],
        ),
      ).rejects.toThrow(/permission denied/i);
      await expect(
        db.as("authenticated", alice, `DELETE FROM public.exams WHERE id = $1`, [examId]),
      ).rejects.toThrow(/permission denied/i);
    });
  });
});
