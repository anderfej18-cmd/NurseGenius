import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TIER_DAILY_LIMIT, TIER_SESSION_LIMIT } from "@/lib/exam-rules";
import { addQuestion, serviceCall } from "./fixtures";
import { createTestDb, type TestDb } from "./pglite-db";

// Finding L3: the tier limits were checked in the service from a profile read taken outside the
// database's lock. The limits are now also enforced inside start_exam_session, under the student's row
// lock, so every path that starts a session (practice, daily challenge, friend challenge) shares one
// atomic rule. These tests call the database function directly, as a stale or buggy caller would.
const TODAY = "2026-10-09";
const POOL = 260;

let db: TestDb;
const pool: string[] = [];
let counter = 0;

const student = async (setup: {
  tier?: string;
  expiry?: string | null;
  used?: number;
  day?: string;
}) => {
  counter += 1;
  const id = await db.createUser(`quota${counter}@example.com`);
  await db.admin(
    `UPDATE public.profiles SET tier = $2, expiry_date = $3, questions_today = $4, last_question_date = $5 WHERE id = $1`,
    [id, setup.tier ?? "novice", setup.expiry ?? null, setup.used ?? 0, setup.day ?? TODAY],
  );
  return id;
};
const start = (user: string, count: number) =>
  serviceCall<{ id: string }>(
    db,
    `SELECT public.start_exam_session($1, 'RN', 'All Areas', 'mixed', 30, '{}', $2::uuid[], $3) AS id`,
    [user, `{${pool.slice(0, count).join(",")}}`, TODAY],
  );
const used = async (user: string) =>
  (
    await db.admin<{ questions_today: number }>(
      `SELECT questions_today FROM public.profiles WHERE id = $1`,
      [user],
    )
  )[0].questions_today;

beforeAll(async () => {
  db = await createTestDb();
  for (let i = 0; i < POOL; i += 1) pool.push(await addQuestion(db));
}, 120_000);
afterAll(() => db.pg.close());

describe("start_exam_session enforces the tier limits itself", () => {
  it("refuses a session once the daily allowance is used up, and leaves the counter alone", async () => {
    const user = await student({ used: TIER_DAILY_LIMIT.novice ?? 0 });
    await expect(start(user, 10)).rejects.toThrow(/daily_limit_reached/);
    expect(await used(user)).toBe(TIER_DAILY_LIMIT.novice);
  });

  it("refuses a session larger than what is left today", async () => {
    const user = await student({ used: 45 });
    await expect(start(user, 10)).rejects.toThrow(/daily_limit_reached/);
    await expect(start(user, 5)).resolves.toHaveLength(1);
    expect(await used(user)).toBe(50);
  });

  it("refuses a session larger than the tier's per-session cap", async () => {
    const user = await student({ tier: "erudite" });
    await expect(start(user, TIER_SESSION_LIMIT.erudite + 1)).rejects.toThrow(
      /session_limit_exceeded/,
    );
  });

  it("treats an expired paid tier as novice", async () => {
    const user = await student({ tier: "erudite", expiry: "2026-10-01T00:00:00Z" });
    await expect(start(user, TIER_SESSION_LIMIT.novice + 1)).rejects.toThrow(
      /session_limit_exceeded/,
    );
  });

  it("counts a counter left over from an earlier day as zero", async () => {
    const user = await student({ used: 50, day: "2026-10-08" });
    await expect(start(user, 10)).resolves.toHaveLength(1);
    expect(await used(user)).toBe(10);
  });

  it("lets the unlimited tier start a full-size session whatever it has used", async () => {
    const user = await student({ tier: "scholar", used: 9999 });
    await expect(start(user, TIER_SESSION_LIMIT.scholar)).resolves.toHaveLength(1);
  });
});

describe("the database limits match the application's", () => {
  it("returns the same daily and per-session caps for every tier", async () => {
    for (const tier of ["novice", "erudite", "scholar"] as const) {
      const [row] = await db.admin<{ daily: number | null; per_session: number }>(
        `SELECT daily, per_session FROM app_private.tier_limits($1::public.user_tier)`,
        [tier],
      );
      expect(row).toEqual({ daily: TIER_DAILY_LIMIT[tier], per_session: TIER_SESSION_LIMIT[tier] });
    }
  });
});
