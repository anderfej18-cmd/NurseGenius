import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serviceCall } from "./fixtures";
import { createTestDb, type TestDb } from "./pglite-db";

let db: TestDb;
let central: string;
let subAdmin: string;
let student: string;
let alice: string;
let bob: string;

const grant = (user: string, role: "admin" | "central_admin") =>
  db.admin(`INSERT INTO public.user_roles (user_id, role) VALUES ($1, $2)`, [user, role]);
const tierOf = async (user: string) =>
  (await db.admin<{ tier: string }>(`SELECT tier FROM public.profiles WHERE id = $1`, [user]))[0]
    .tier;

beforeAll(async () => {
  db = await createTestDb();
  [central, subAdmin, student, alice, bob] = await Promise.all(
    ["central", "sub", "student", "alice", "bob"].map((n) => db.createUser(`${n}-aa@example.com`)),
  );
  await grant(central, "central_admin");
  await grant(subAdmin, "admin");
  for (const [id, name] of [
    [alice, "Alice"],
    [bob, "bob"],
    [student, "carol"],
  ]) {
    await db.admin(`UPDATE public.profiles SET username = $2 WHERE id = $1`, [id, name]);
  }
  await db.admin(`UPDATE public.profiles SET tier = 'scholar' WHERE id = $1`, [alice]);
});
afterAll(() => db.pg.close());

describe("who may assign a paid tier (central admin only; ADR-0008)", () => {
  const assign = (caller: string, target: string) =>
    db.as("authenticated", caller, `SELECT public.assign_user_tier($1, 'scholar', 30)`, [target]);

  it("lets the central admin assign a tier", async () => {
    await assign(central, student);
    expect(await tierOf(student)).toBe("scholar");
    await db.admin(`UPDATE public.profiles SET tier = 'novice', expiry_date = NULL WHERE id = $1`, [
      student,
    ]);
  });

  it("refuses a sub-admin, and a student", async () => {
    await expect(assign(subAdmin, student)).rejects.toThrow(/Not authorized/);
    await expect(assign(student, student)).rejects.toThrow(/Not authorized/);
    expect(await tierOf(student)).toBe("novice");
  });

  it("refuses a sub-admin for receipt approval too, before looking at the receipt", async () => {
    const missing = "00000000-0000-4000-8000-000000000009";
    const approve = (caller: string) =>
      db.as("authenticated", caller, `SELECT public.approve_receipt($1)`, [missing]);
    await expect(approve(subAdmin)).rejects.toThrow(/Not authorized/);
    await expect(approve(central)).rejects.toThrow(/Receipt not found/);
  });
});

describe("leaderboards are reachable by the server only", () => {
  const rowsAs = (role: "service_role" | "authenticated", fn: string) =>
    role === "service_role"
      ? serviceCall<{ username: string; attempted: number }>(db, `SELECT * FROM public.${fn}()`)
      : db.as("authenticated", student, `SELECT * FROM public.${fn}()`);

  beforeAll(async () => {
    await db.admin(
      `INSERT INTO public.questions (exam_type, topic, question_text, option_a, option_b, option_c, option_d, correct_answer)
       SELECT 'RN', 'Board', 'Q' || g, 'a', 'b', 'c', 'd', 'A' FROM generate_series(1, 100) g`,
    );
    const finished = async (user: string, answered: number) => {
      const [{ id }] = await db.admin<{ id: string }>(
        `INSERT INTO public.exams (user_id, exam_type, category, total_questions, time_limit_minutes, deadline_at, status, completed_at, score_pct, score_verified)
         VALUES ($1, 'RN', 'All Areas', $2, 30, now() + interval '30 minutes', 'completed', now(), 80, true) RETURNING id`,
        [user, answered],
      );
      await db.admin(
        `INSERT INTO public.exam_answers (exam_id, question_id, position, user_answer, is_correct)
         SELECT $1, id, (row_number() OVER ())::int - 1, 'A', true FROM public.questions WHERE topic = 'Board' LIMIT $2`,
        [id, answered],
      );
    };
    await finished(alice, 100);
    await finished(bob, 5);
  });

  it.each(["get_daily_leaderboard", "get_weekly_leaderboard"])(
    "%s cannot be called from a signed-in browser, which is why the app reads it through a server function",
    async (fn) => {
      await expect(rowsAs("authenticated", fn)).rejects.toThrow(/permission denied/i);
    },
  );

  it("lists only students with 100 or more answers today, for the server", async () => {
    const rows = await rowsAs("service_role", "get_daily_leaderboard");
    expect(rows.map((row) => row.username)).toEqual(["Alice"]);
    expect(rows[0].attempted).toBe(100);
  });
});

describe("the sub-admin user directory (username and tier only)", () => {
  it("cannot be called from a signed-in browser, whatever their role", async () => {
    for (const caller of [subAdmin, central, student]) {
      await expect(
        db.as("authenticated", caller, `SELECT * FROM public.list_user_directory(10, 0)`),
      ).rejects.toThrow(/permission denied/i);
      await expect(
        db.as("authenticated", caller, `SELECT * FROM public.count_users_by_tier()`),
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it("returns exactly a username and a tier per student, in a stable order", async () => {
    const rows = await serviceCall<Record<string, unknown>>(
      db,
      `SELECT * FROM public.list_user_directory(50, 0)`,
    );
    expect(Object.keys(rows[0]).sort()).toEqual(["tier", "username"]);
    const named = rows.filter((row) => ["Alice", "bob", "carol"].includes(String(row.username)));
    expect(named.map((row) => row.username)).toEqual(["Alice", "bob", "carol"]);
  });

  it("pages, and clamps an oversized or negative request", async () => {
    const first = await serviceCall(db, `SELECT * FROM public.list_user_directory(2, 0)`);
    const second = await serviceCall(db, `SELECT * FROM public.list_user_directory(2, 2)`);
    expect(first).toHaveLength(2);
    expect(second.length).toBeGreaterThan(0);
    expect(
      await serviceCall(db, `SELECT * FROM public.list_user_directory(100000, -5)`),
    ).not.toHaveLength(0);
    expect(
      (await serviceCall(db, `SELECT * FROM public.list_user_directory(100000, 0)`)).length,
    ).toBeLessThanOrEqual(200);
  });

  it("counts students per tier without listing them", async () => {
    const rows = await serviceCall<{ tier: string; total: number }>(
      db,
      `SELECT * FROM public.count_users_by_tier()`,
    );
    const byTier = Object.fromEntries(rows.map((row) => [row.tier, row.total]));
    expect(byTier.scholar).toBe(1);
    expect(byTier.novice).toBeGreaterThanOrEqual(4);
  });
});
