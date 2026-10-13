import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addQuestion, serviceCall } from "./fixtures";
import { createTestDb, type TestDb } from "./pglite-db";

// Migration 20261012100000: student data is the central admin's alone (sub-admins keep question work),
// and a question can be deleted for good only when no student has answered it, with an audit record.

let db: TestDb;
let central: string;
let subAdmin: string;
let student: string;

beforeAll(async () => {
  db = await createTestDb();
  [central, subAdmin, student] = await Promise.all(
    ["central", "sub", "student"].map((n) => db.createUser(`${n}-privacy@example.com`)),
  );
  await db.admin(
    `INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'central_admin'), ($2, 'admin')`,
    [central, subAdmin],
  );
  await db.admin(
    `INSERT INTO public.exams (user_id, exam_type, category, total_questions, time_limit_minutes, deadline_at, status, completed_at, score_pct)
     VALUES ($1, 'RN', 'All Areas', 10, 30, now(), 'completed', now(), 70)`,
    [student],
  );
  await db.admin(
    `INSERT INTO public.subscription_payments (user_id, plan_name, amount_ngn, duration_days, reference)
     VALUES ($1, 'erudite', 3000, 30, 'ref-privacy-1')`,
    [student],
  );
  const [{ id: test }] = await db.admin<{ id: string }>(
    `INSERT INTO public.custom_tests (owner_id, title, exam_type, source_mode, duration_minutes, expires_at, token_hash, status)
     VALUES ($1, 'T', 'RN', 'upload', 30, now() + interval '1 day', repeat('a', 64), 'published') RETURNING id`,
    [subAdmin],
  );
  await db.admin(
    `INSERT INTO public.custom_test_attempts (custom_test_id, email, access_hash, total_questions)
     VALUES ($1, 'guest@example.com', repeat('b', 64), 1)`,
    [test],
  );
});
afterAll(() => db.pg.close());

const count = async (user: string, table: string) =>
  (
    await db.as<{ n: number }>(
      "authenticated",
      user,
      `SELECT count(*)::int AS n FROM public.${table}`,
    )
  )[0].n;

describe("student data is visible to the central admin, not to sub-admins", () => {
  for (const table of ["exams", "subscription_payments", "custom_test_attempts"]) {
    it(`${table}: central admin sees the row, a sub-admin sees none`, async () => {
      expect(await count(central, table)).toBeGreaterThan(0);
      expect(await count(subAdmin, table)).toBe(0);
    });
  }

  it("a student still sees their own exams and payments", async () => {
    expect(await count(student, "exams")).toBe(1);
    expect(await count(student, "subscription_payments")).toBe(1);
  });

  it("only the central admin may read or update payment receipts of others", async () => {
    const policies = await db.admin<{ policyname: string; qual: string }>(
      `SELECT policyname, qual FROM pg_policies WHERE tablename = 'payment_receipts' AND cmd IN ('SELECT', 'UPDATE')`,
    );
    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies) expect(policy.qual).not.toMatch(/is_any_admin/);
  });

  it("a sub-admin cannot read other people's profiles", async () => {
    expect(await count(subAdmin, "profiles")).toBe(1);
  });
});

describe("admin_delete_question", () => {
  const remove = (admin: string, question: string) =>
    serviceCall(db, `SELECT public.admin_delete_question($1, $2)`, [admin, question]);

  it("deletes an unused question and records a full copy in the audit log", async () => {
    const question = await addQuestion(db, { topic: "Audit" });
    await remove(subAdmin, question);
    expect(await db.admin(`SELECT 1 FROM public.questions WHERE id = $1`, [question])).toHaveLength(
      0,
    );
    const [entry] = await db.admin<{
      action: string;
      actor_id: string;
      details: { question: { topic: string } };
    }>(`SELECT action, actor_id, details FROM public.admin_audit_log WHERE target_id = $1`, [
      question,
    ]);
    expect(entry).toMatchObject({ action: "question.delete", actor_id: subAdmin });
    expect(entry.details.question.topic).toBe("Audit");
  });

  it("refuses a question a student has answered, naming how many answers keep it", async () => {
    const question = await addQuestion(db);
    const [{ id: exam }] = await db.admin<{ id: string }>(
      `SELECT id FROM public.exams WHERE user_id = $1`,
      [student],
    );
    await db.admin(
      `INSERT INTO public.exam_answers (exam_id, question_id, user_answer, is_correct, position) VALUES ($1, $2, 'A', true, 0)`,
      [exam, question],
    );
    await expect(remove(central, question)).rejects.toThrow(/question_in_use:1/);
    expect(await db.admin(`SELECT 1 FROM public.questions WHERE id = $1`, [question])).toHaveLength(
      1,
    );
  });

  it("refuses a caller who is not an admin, and a missing question", async () => {
    const question = await addQuestion(db);
    await expect(remove(student, question)).rejects.toThrow(/not_authorized/);
    await expect(remove(central, "00000000-0000-4000-8000-000000000000")).rejects.toThrow(
      /question_not_found/,
    );
  });

  it("cannot be called from the browser, and the audit log is server-only", async () => {
    const question = await addQuestion(db);
    await expect(
      db.as("authenticated", central, `SELECT public.admin_delete_question($1, $2)`, [
        central,
        question,
      ]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.as("authenticated", central, `SELECT * FROM public.admin_audit_log`),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("a sub-admin trying to get round the screens, straight at the database", () => {
  const asSub = (sql: string, params: unknown[] = []) =>
    db.as("authenticated", subAdmin, sql, params);

  it("cannot grant or revoke roles, nor become the central admin", async () => {
    await expect(
      asSub(`INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'central_admin')`, [
        subAdmin,
      ]),
    ).rejects.toThrow(/row-level security|permission denied/i);
    await expect(
      asSub(`INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'admin')`, [student]),
    ).rejects.toThrow(/row-level security|permission denied/i);
    const removed = await asSub(`DELETE FROM public.user_roles WHERE user_id = $1 RETURNING 1`, [
      central,
    ]);
    expect(removed).toEqual([]);
    expect(
      await db.admin(
        `SELECT 1 FROM public.user_roles WHERE user_id = $1 AND role = 'central_admin'`,
        [central],
      ),
    ).toHaveLength(1);
  });

  it("cannot change anyone's tier, directly or through the function", async () => {
    await expect(
      asSub(`UPDATE public.profiles SET tier = 'scholar' WHERE id = $1`, [student]),
    ).rejects.toThrow(/permission denied|row-level security/i);
    await expect(
      asSub(`SELECT public.assign_user_tier($1, 'scholar', 30)`, [student]),
    ).rejects.toThrow(/Not authorized/);
    const [{ tier }] = await db.admin<{ tier: string }>(
      `SELECT tier FROM public.profiles WHERE id = $1`,
      [student],
    );
    expect(tier).toBe("novice");
  });

  it("cannot read emails or other personal details from profiles, receipts or attempts", async () => {
    expect(await asSub(`SELECT email FROM public.profiles WHERE id <> $1`, [subAdmin])).toEqual([]);
    expect(await asSub(`SELECT 1 FROM public.payment_receipts`)).toEqual([]);
    expect(await asSub(`SELECT email FROM public.custom_test_attempts`)).toEqual([]);
  });

  it("cannot reach the privileged directory and leaderboard functions, which only the server runs", async () => {
    await expect(asSub(`SELECT * FROM public.list_user_directory(10, 0)`)).rejects.toThrow(
      /permission denied/i,
    );
  });

  it("can still read and manage the question bank's content through the server, and read questions directly", async () => {
    await addQuestion(db, { topic: "Sub-admin visible" });
    expect(
      await asSub(`SELECT 1 FROM public.questions WHERE topic = 'Sub-admin visible'`),
    ).toHaveLength(1);
  });
});
