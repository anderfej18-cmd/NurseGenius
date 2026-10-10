import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addQuestion, moveSessionTo, runSession, serviceCall } from "./fixtures";
import { createTestDb, type TestDb } from "./pglite-db";

let db: TestDb;
let alice: string;
let bob: string;
let q: string[];
let aliceFirst: string;
let aliceSecond: string;

const event = (sourceType: string, sourceId: string, xp: number) => ({
  source_type: sourceType,
  source_id: sourceId,
  xp,
  occurred_at: "2026-10-01T10:00:00Z",
});
const record = (userId: string, events: unknown[]) =>
  serviceCall<{ n: number }>(db, `SELECT public.record_xp_events($1, $2::jsonb) AS n`, [
    userId,
    JSON.stringify(events),
  ]);
const total = async (userId: string) =>
  Number(
    (await serviceCall<{ t: string }>(db, `SELECT public.get_xp_total($1)::text AS t`, [userId]))[0]
      .t,
  );
const unawarded = (userId: string) =>
  serviceCall<Record<string, number | string>>(
    db,
    `SELECT exam_id, answered, correct, first_correct FROM public.get_unawarded_sessions($1, 50)`,
    [userId],
  );

beforeAll(async () => {
  db = await createTestDb();
  alice = await db.createUser("alice-xp@example.com");
  bob = await db.createUser("bob-xp@example.com");
  q = await Promise.all(Array.from({ length: 4 }, () => addQuestion(db, { correct: "A" })));

  // Alice: first session gets q0 right and q1 wrong; second repeats q0 (right) and gets q1 right.
  aliceFirst = await runSession(db, alice, [
    [q[0], "A"],
    [q[1], "B"],
  ]);
  await moveSessionTo(db, aliceFirst, "2026-10-01T10:00:00Z");
  aliceSecond = await runSession(db, alice, [
    [q[0], "A"],
    [q[1], "A"],
  ]);
  await moveSessionTo(db, aliceSecond, "2026-10-02T10:00:00Z");
});
afterAll(() => db.pg.close());

describe("record_xp_events", () => {
  it("stores events once: the same source cannot be paid twice", async () => {
    expect(
      (
        await record(bob, [event("session", "s-1", 30), event("daily_practice", "2026-10-01", 20)])
      )[0].n,
    ).toBe(2);
    expect((await record(bob, [event("session", "s-1", 30)]))[0].n).toBe(0);
    expect(await total(bob)).toBe(50);
  });

  it("allows a zero-XP marker, so a processed session is not listed again", async () => {
    expect((await record(bob, [event("session", "s-zero", 0)]))[0].n).toBe(1);
  });

  it.each([
    ["a negative amount", event("session", "s-neg", -5)],
    ["an unknown source", event("bonus_from_client", "x", 10)],
    ["an empty source id", event("session", "", 10)],
  ])("rejects %s", async (_label, bad) => {
    await expect(record(bob, [bad])).rejects.toThrow();
  });

  it("keeps each student's ledger apart", async () => {
    expect(await total(alice)).toBe(0);
  });
});

describe("get_unawarded_sessions", () => {
  it("lists finished sessions oldest first, with the first-correct facts", async () => {
    const rows = await unawarded(alice);
    expect(rows.map((r) => r.exam_id)).toEqual([aliceFirst, aliceSecond]);
    // Session 1: q0 right (first time), q1 wrong. Session 2: q0 right again (not new), q1 right (first time).
    expect(rows[0]).toMatchObject({ answered: 2, correct: 1, first_correct: 1 });
    expect(rows[1]).toMatchObject({ answered: 2, correct: 2, first_correct: 1 });
  });

  it("stops listing a session once its marker is recorded", async () => {
    await record(alice, [event("session", aliceFirst, 10)]);
    expect((await unawarded(alice)).map((r) => r.exam_id)).toEqual([aliceSecond]);
  });

  it("leaves out unfinished sessions and other students", async () => {
    const carol = await db.createUser("carol-xp@example.com");
    await runSession(db, carol, [[q[2], "A"]], { submit: false });
    expect(await unawarded(carol)).toEqual([]);
  });

  it("respects the limit", async () => {
    const rows = await serviceCall(db, `SELECT * FROM public.get_unawarded_sessions($1, 1)`, [
      alice,
    ]);
    expect(rows).toHaveLength(1);
  });
});

describe("unlock_achievements", () => {
  const unlock = (userId: string, unlocks: unknown[]) =>
    serviceCall<{ codes: string[] }>(
      db,
      `SELECT public.unlock_achievements($1, $2::jsonb) AS codes`,
      [userId, JSON.stringify(unlocks)],
    );

  it("records the achievement and its XP together, once", async () => {
    const before = await total(alice);
    const first = await unlock(alice, [
      { code: "first_session", xp: 25, unlocked_at: "2026-10-02T10:00:00Z" },
    ]);
    expect(first[0].codes).toEqual(["first_session"]);
    expect(await total(alice)).toBe(before + 25);

    const again = await unlock(alice, [
      { code: "first_session", xp: 25, unlocked_at: "2026-10-03T10:00:00Z" },
    ]);
    expect(again[0].codes).toEqual([]);
    expect(await total(alice)).toBe(before + 25);
  });

  it("returns only the codes that were new", async () => {
    const result = await unlock(alice, [
      { code: "first_session", xp: 25, unlocked_at: "2026-10-04T10:00:00Z" },
      { code: "streak_3", xp: 40, unlocked_at: "2026-10-04T10:00:00Z" },
    ]);
    expect(result[0].codes).toEqual(["streak_3"]);
  });
});

describe("get_engagement_snapshot", () => {
  it("counts what the student has done, with thresholds given by the server", async () => {
    const [{ s }] = await serviceCall<{ s: Record<string, number> }>(
      db,
      `SELECT public.get_engagement_snapshot($1, 2, 1) AS s`,
      [alice],
    );
    // Two sessions of two answers: 4 answered, 3 correct, session 2 is perfect at the 2-answer threshold.
    expect(s).toMatchObject({
      questions_answered: 4,
      correct_answers: 3,
      sessions_completed: 2,
      perfect_sessions: 1,
      topics_practised: 1,
    });
  });

  it("is empty for a student with no history", async () => {
    const dave = await db.createUser("dave-xp@example.com");
    const [{ s }] = await serviceCall<{ s: Record<string, number> }>(
      db,
      `SELECT public.get_engagement_snapshot($1, 10, 5) AS s`,
      [dave],
    );
    expect(s).toMatchObject({ questions_answered: 0, sessions_completed: 0, perfect_sessions: 0 });
  });
});

describe("privileges", () => {
  it("lets a student read only their own ledger and achievements", async () => {
    const own = await db.as<{ source_id: string }>(
      "authenticated",
      alice,
      `SELECT source_id FROM public.xp_events`,
    );
    expect(own.length).toBeGreaterThan(0);
    const owned = await db.as<{ user_id: string }>(
      "authenticated",
      alice,
      `SELECT DISTINCT user_id FROM public.xp_events`,
    );
    expect(owned.map((r) => r.user_id)).toEqual([alice]);
    const badges = await db.as<{ user_id: string }>(
      "authenticated",
      alice,
      `SELECT DISTINCT user_id FROM public.user_achievements`,
    );
    expect(badges.map((r) => r.user_id)).toEqual([alice]);
  });

  it.each([
    [
      "insert XP",
      `INSERT INTO public.xp_events (user_id, source_type, source_id, xp) VALUES ($1, 'session', 'forged', 99999)`,
    ],
    ["update XP", `UPDATE public.xp_events SET xp = 99999 WHERE user_id = $1`],
    ["delete XP", `DELETE FROM public.xp_events WHERE user_id = $1`],
    [
      "insert an achievement",
      `INSERT INTO public.user_achievements (user_id, code, xp_awarded) VALUES ($1, 'streak_365', 1000)`,
    ],
  ])("does not let a student %s", async (_label, sql) => {
    await expect(db.as("authenticated", alice, sql, [alice])).rejects.toThrow(/permission denied/i);
  });

  it.each([
    [`SELECT public.record_xp_events($1, '[]'::jsonb)`],
    [`SELECT public.unlock_achievements($1, '[]'::jsonb)`],
    [`SELECT public.get_xp_total($1)`],
    [`SELECT * FROM public.get_unawarded_sessions($1, 10)`],
    [`SELECT public.get_engagement_snapshot($1, 10, 5)`],
  ])("does not let a student call %s", async (sql) => {
    await expect(db.as("authenticated", alice, sql, [alice])).rejects.toThrow(/permission denied/i);
  });
});
