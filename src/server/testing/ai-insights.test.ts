import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./pglite-db";

// AI learning features: where a generated explanation is kept (one per student and kind, written by
// the server only) and the readiness history (a snapshot only when the evidence changed, 30 kept).
const HASH = "a".repeat(64);
const OTHER_HASH = "b".repeat(64);

let db: TestDb;
let alice: string;
let bob: string;

beforeAll(async () => {
  db = await createTestDb();
  [alice, bob] = await Promise.all(
    ["alice", "bob"].map((name) => db.createUser(`${name}-ai@example.com`)),
  );
});
afterAll(() => db.pg.close());

const saveInsight = (user: string, kind: string, hash: string, summary = "s") =>
  db.as("service_role", null, `SELECT 1`).then(() =>
    db.admin(
      `INSERT INTO public.ai_insights (user_id, kind, facts_hash, narrative, model, prompt_version, prompt_tokens, completion_tokens)
       VALUES ($1, $2, $3, $4::jsonb, 'm', 'v1', 10, 5)
       ON CONFLICT (user_id, kind) DO UPDATE SET facts_hash = EXCLUDED.facts_hash, narrative = EXCLUDED.narrative`,
      [user, kind, hash, JSON.stringify({ summary })],
    ),
  );

describe("ai_insights", () => {
  it("keeps one row per student and kind, replaced when the facts change", async () => {
    await saveInsight(alice, "readiness", HASH, "first");
    await saveInsight(alice, "readiness", OTHER_HASH, "second");
    const rows = await db.admin<{ facts_hash: string; narrative: { summary: string } }>(
      `SELECT facts_hash, narrative FROM public.ai_insights WHERE user_id = $1 AND kind = 'readiness'`,
      [alice],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ facts_hash: OTHER_HASH, narrative: { summary: "second" } });
  });

  it("holds separate rows for different kinds and different students", async () => {
    await saveInsight(alice, "recommendation", HASH);
    await saveInsight(bob, "readiness", HASH);
    const [{ n }] = await db.admin<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.ai_insights`,
    );
    expect(n).toBe(3);
  });

  it("refuses an unknown kind and a malformed hash", async () => {
    await expect(saveInsight(alice, "horoscope", HASH)).rejects.toThrow(/check|violates/i);
    await expect(saveInsight(alice, "plan", "short")).rejects.toThrow(/check|violates/i);
  });

  it("cannot be read or written by a student or a visitor: it is reached only through the server", async () => {
    for (const role of ["authenticated", "anon"] as const) {
      await expect(
        db.as(role, role === "anon" ? null : alice, `SELECT * FROM public.ai_insights`),
      ).rejects.toThrow(/permission denied/i);
    }
    await expect(
      db.as("authenticated", alice, `DELETE FROM public.ai_insights WHERE user_id = $1`, [bob]),
    ).rejects.toThrow(/permission denied/i);
  });

  it("is removed with the student's account", async () => {
    const temp = await db.createUser("temp-ai@example.com");
    await saveInsight(temp, "plan", HASH);
    await db.admin(`DELETE FROM auth.users WHERE id = $1`, [temp]);
    const [{ n }] = await db.admin<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.ai_insights WHERE user_id = $1`,
      [temp],
    );
    expect(n).toBe(0);
  });
});

interface Snapshot {
  assessed_at: string;
  score: string | null;
  band: string;
  attempts: number;
}
const record = (user: string, score: number | null, attempts: number, examType = "RN") =>
  db.as<Snapshot>(
    "service_role",
    null,
    `SELECT * FROM public.record_readiness_snapshot(_user_id => $1, _exam_type => $2::public.exam_type, _score => $3, _band => 'developing', _attempts => $4, _completeness => 0.8, _components => '{}'::jsonb)`,
    [user, examType, score, attempts],
  );

describe("record_readiness_snapshot", () => {
  it("stores a snapshot and returns the latest two, newest first", async () => {
    const first = await record(alice, 40, 120);
    expect(first.map((s) => s.attempts)).toEqual([120]);
    const second = await record(alice, 45.5, 150);
    expect(second.map((s) => s.attempts)).toEqual([150, 120]);
    expect(Number(second[0].score)).toBe(45.5);
  });

  it("does not store a new snapshot when nothing changed", async () => {
    await record(alice, 45.5, 150);
    const rows = await record(alice, 45.5, 150);
    expect(rows.map((s) => s.attempts)).toEqual([150, 120]);
    const [{ n }] = await db.admin<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.readiness_snapshots WHERE user_id = $1`,
      [alice],
    );
    expect(n).toBe(2);
  });

  it("keeps a student's history apart from everyone else's and per exam type", async () => {
    const bobRows = await record(bob, 70, 300);
    expect(bobRows.map((s) => s.attempts)).toEqual([300]);
    const rm = await record(alice, 30, 40, "RM");
    expect(rm.map((s) => s.attempts)).toEqual([40]);
  });

  it("keeps only the latest 30 snapshots", async () => {
    const carol = await db.createUser("carol-ai@example.com");
    for (let attempts = 100; attempts < 135; attempts += 1) await record(carol, 50, attempts);
    const [{ n }] = await db.admin<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.readiness_snapshots WHERE user_id = $1`,
      [carol],
    );
    expect(n).toBe(30);
    const [{ oldest }] = await db.admin<{ oldest: number }>(
      `SELECT min(attempts)::int AS oldest FROM public.readiness_snapshots WHERE user_id = $1`,
      [carol],
    );
    expect(oldest).toBe(105);
  });

  it("is for the server only, and the table is not readable by students", async () => {
    await expect(
      db.as(
        "authenticated",
        alice,
        `SELECT * FROM public.record_readiness_snapshot(_user_id => $1, _exam_type => 'RN', _score => 1, _band => 'early', _attempts => 1, _completeness => 1, _components => '{}'::jsonb)`,
        [alice],
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      db.as("authenticated", alice, `SELECT * FROM public.readiness_snapshots`),
    ).rejects.toThrow(/permission denied/i);
  });

  it("accepts a snapshot with no score yet (too few answers)", async () => {
    const dave = await db.createUser("dave-ai@example.com");
    const rows = await db.as<Snapshot>(
      "service_role",
      null,
      `SELECT * FROM public.record_readiness_snapshot(_user_id => $1, _exam_type => 'RN', _band => 'not_enough_data', _attempts => 5, _completeness => 0.2, _components => '{}'::jsonb)`,
      [dave],
    );
    expect(rows[0].score).toBeNull();
  });
});
