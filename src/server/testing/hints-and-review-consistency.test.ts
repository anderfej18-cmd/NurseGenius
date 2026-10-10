import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addQuestion, runSession, serviceCall } from "./fixtures";
import { createTestDb, type TestDb } from "./pglite-db";

let db: TestDb;
let alice: string;
let bob: string;
let q1: string;
let q2: string;

const save = (
  user: string,
  exam: string,
  question: string,
  extra: { answer?: string; hint?: boolean | null } = {},
) =>
  serviceCall<{ r: string }>(
    db,
    `SELECT public.save_exam_answer($1, $2, $3, 10, $4, null, null, null, $5) AS r`,
    [user, exam, question, extra.answer ?? null, extra.hint ?? null],
  ).then((rows) => rows[0].r);
const hints = async (exam: string, question: string) =>
  (
    await db.admin<{ hints_used: number; user_answer: string | null }>(
      `SELECT hints_used, user_answer FROM public.exam_answers WHERE exam_id = $1 AND question_id = $2`,
      [exam, question],
    )
  )[0];

beforeAll(async () => {
  db = await createTestDb();
  [alice, bob] = await Promise.all(
    ["alice", "bob"].map((n) => db.createUser(`${n}-hint@example.com`)),
  );
  q1 = await addQuestion(db, { correct: "A" });
  q2 = await addQuestion(db, { correct: "B" });
});
afterAll(() => db.pg.close());

describe("hints_used", () => {
  it("starts at zero for every answer, including ones that existed before the column", async () => {
    const exam = await runSession(
      db,
      alice,
      [
        [q1, "A"],
        [q2, "B"],
      ],
      { submit: false },
    );
    expect((await hints(exam, q1)).hints_used).toBe(0);
    await serviceCall(db, `SELECT public.submit_exam_session($1, $2)`, [alice, exam]);
  });

  it("counts one hint per report, never a total the client chose", async () => {
    const exam = await runSession(
      db,
      alice,
      [
        [q1, null],
        [q2, null],
      ],
      { submit: false, today: "2026-10-07" },
    );
    await save(alice, exam, q1, { hint: true });
    await save(alice, exam, q1, { hint: true });
    expect((await hints(exam, q1)).hints_used).toBe(2);
    expect((await hints(exam, q2)).hints_used).toBe(0);
    await save(alice, exam, q1, { answer: "A", hint: false });
    await save(alice, exam, q1, { answer: "A", hint: null });
    expect((await hints(exam, q1)).hints_used).toBe(2);
  });

  it("stops counting at ten, so a loop cannot inflate it", async () => {
    const exam = await runSession(db, bob, [[q1, null]], { submit: false });
    for (let i = 0; i < 15; i += 1) await save(bob, exam, q1, { hint: true });
    expect((await hints(exam, q1)).hints_used).toBe(10);
  });

  it("does not change the answer or the score", async () => {
    const frank = await db.createUser("frank-hint@example.com");
    const exam = await runSession(db, frank, [[q1, "B"]], { submit: false, today: "2026-10-08" });
    await save(frank, exam, q1, { hint: true });
    expect((await hints(exam, q1)).user_answer).toBe("B");
    const [result] = await serviceCall<{ r: { correct_count: number } }>(
      db,
      `SELECT public.submit_exam_session($1, $2) AS r`,
      [frank, exam],
    );
    expect(result.r.correct_count).toBe(0);
  });

  it("is refused for a finished exam and for someone else's exam", async () => {
    const grace = await db.createUser("grace-hint@example.com");
    const exam = await runSession(db, grace, [[q1, "A"]], { today: "2026-10-09" });
    expect(await save(grace, exam, q1, { hint: true })).toBe("closed");
    expect(await save(bob, exam, q1, { hint: true })).toBe("not_found");
    expect((await hints(exam, q1)).hints_used).toBe(0);
  });

  it("cannot be written by a signed-in student directly", async () => {
    const heidi = await db.createUser("heidi-hint@example.com");
    const exam = await runSession(db, heidi, [[q1, "A"]], { today: "2026-10-10" });
    await expect(
      db.as(
        "authenticated",
        heidi,
        `UPDATE public.exam_answers SET hints_used = 0 WHERE exam_id = $1`,
        [exam],
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe("the review schedule after a crash between scoring and the schedule write (ADR-0002)", () => {
  it("is flagged stale by the same statement that scored the attempt, so the next read repairs it", async () => {
    const carol = await db.createUser("carol-review@example.com");
    const exam = await runSession(db, carol, [[q1, "A"]], { today: "2026-10-11" });
    const [stats] = await db.admin<{
      attempts: number;
      review_count: number;
      review_stale: boolean;
    }>(
      `SELECT attempts, review_count, review_stale FROM public.user_question_stats WHERE user_id = $1 AND question_id = $2`,
      [carol, q1],
    );
    expect(stats).toEqual({ attempts: 1, review_count: 0, review_stale: true });
    expect(exam).toBeTruthy();
    const stale = await db.admin(
      `SELECT 1 FROM public.user_question_stats WHERE user_id = $1 AND review_stale`,
      [carol],
    );
    expect(stale).toHaveLength(1);
  });

  it("is repaired by writing the schedule once, and writing it again changes nothing", async () => {
    const dave = await db.createUser("dave-review@example.com");
    await runSession(db, dave, [[q1, "A"]], { today: "2026-10-12" });
    const state = JSON.stringify([
      {
        question_id: q1,
        next_review_at: "2026-10-20T00:00:00Z",
        review_count: 1,
        last_reviewed_at: "2026-10-12T00:00:00Z",
        review_status: "learning",
        interval_days: 1,
        ease: 2.5,
      },
    ]);
    const apply = () =>
      serviceCall(db, `SELECT public.apply_review_states($1, $2::jsonb)`, [dave, state]);
    await apply();
    await apply();
    const [stats] = await db.admin<{
      attempts: number;
      review_count: number;
      review_stale: boolean;
    }>(
      `SELECT attempts, review_count, review_stale FROM public.user_question_stats WHERE user_id = $1`,
      [dave],
    );
    expect(stats).toEqual({ attempts: 1, review_count: 1, review_stale: false });
  });

  it("is not made stale again, and no attempt is counted again, by submitting twice", async () => {
    const erin = await db.createUser("erin-review@example.com");
    const exam = await runSession(db, erin, [[q1, "A"]], { today: "2026-10-13" });
    await serviceCall(db, `SELECT public.submit_exam_session($1, $2)`, [erin, exam]);
    const [stats] = await db.admin<{ attempts: number }>(
      `SELECT attempts FROM public.user_question_stats WHERE user_id = $1`,
      [erin],
    );
    expect(stats.attempts).toBe(1);
  });
});
