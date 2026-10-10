import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serviceCall } from "./fixtures";
import { createTestDb, type TestDb } from "./pglite-db";

let db: TestDb;
let alice: string;
let bob: string;

const PLAN = { weeks: [], summary: { totalQuestions: 0 } };
const save = (userId: string, overrides: Record<string, unknown> = {}) => {
  const row = {
    user_id: userId,
    exam_type: "RN",
    exam_date: "2026-12-01",
    starts_on: "2026-10-06",
    daily_minutes: 30,
    days_per_week: 5,
    target_score: 80,
    questions_per_day: 20,
    plan: JSON.stringify(PLAN),
    ...overrides,
  };
  const columns = Object.keys(row);
  return serviceCall(
    db,
    `INSERT INTO public.study_plans (${columns.join(", ")})
     VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")})
     ON CONFLICT (user_id) DO UPDATE SET
       ${columns
         .filter((column) => column !== "user_id")
         .map((column) => `${column} = EXCLUDED.${column}`)
         .join(", ")}`,
    Object.values(row),
  );
};

beforeAll(async () => {
  db = await createTestDb();
  alice = await db.createUser("alice-plan@example.com");
  bob = await db.createUser("bob-plan@example.com");
});
afterAll(() => db.pg.close());

describe("study_plans", () => {
  it("keeps one plan per student: saving again replaces it", async () => {
    await save(alice);
    await save(alice, { daily_minutes: 60 });
    const rows = await db.admin<{ daily_minutes: number }>(
      `SELECT daily_minutes FROM public.study_plans WHERE user_id = $1`,
      [alice],
    );
    expect(rows).toEqual([{ daily_minutes: 60 }]);
  });

  it("lets a student read only their own plan", async () => {
    await save(alice);
    await save(bob);
    const rows = await db.as<{ user_id: string }>(
      "authenticated",
      alice,
      `SELECT user_id FROM public.study_plans`,
    );
    expect(rows).toEqual([{ user_id: alice }]);
  });

  it("gives a student no way to write a plan", async () => {
    await expect(
      db.as(
        "authenticated",
        alice,
        `INSERT INTO public.study_plans (user_id, exam_type, exam_date, starts_on, daily_minutes, days_per_week, target_score, questions_per_day, plan)
         VALUES ($1, 'RN', '2026-12-01', '2026-10-06', 30, 5, 80, 20, '{}')`,
        [alice],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.as("authenticated", alice, `UPDATE public.study_plans SET target_score = 100`),
    ).rejects.toThrow(/permission denied/);
    await expect(db.as("authenticated", alice, `DELETE FROM public.study_plans`)).rejects.toThrow(
      /permission denied/,
    );
  });

  it("hides plans from anonymous callers", async () => {
    await expect(db.as("anon", null, `SELECT * FROM public.study_plans`)).rejects.toThrow(
      /permission denied/,
    );
  });

  it.each([
    ["study time below the minimum", { daily_minutes: 5 }],
    ["study time above the maximum", { daily_minutes: 241 }],
    ["no study days", { days_per_week: 0 }],
    ["eight study days", { days_per_week: 8 }],
    ["a target below the minimum", { target_score: 49 }],
    ["a target above 100", { target_score: 101 }],
    ["no questions a day", { questions_per_day: 0 }],
    ["an exam date that is not after the start", { exam_date: "2026-10-06" }],
    ["a plan that is not an object", { plan: JSON.stringify([1]) }],
  ])("rejects %s", async (_label, overrides) => {
    await expect(save(alice, overrides)).rejects.toThrow(/violates check constraint/);
  });

  it("removes the plan with the student", async () => {
    const carol = await db.createUser("carol-plan@example.com");
    await save(carol);
    await db.admin(`DELETE FROM auth.users WHERE id = $1`, [carol]);
    const rows = await db.admin(`SELECT 1 FROM public.study_plans WHERE user_id = $1`, [carol]);
    expect(rows).toEqual([]);
  });
});
