import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addQuestion, serviceCall } from "./fixtures";
import { createTestDb, type TestDb } from "./pglite-db";

let db: TestDb;
let alice: string;
let bob: string;
let rn: string[];
let rm: string;
let retired: string;

const DAY = "2026-10-06";
const create = (userId: string, ids: string[], date = DAY, examType = "RN") =>
  serviceCall<{ id: string }>(
    db,
    `SELECT public.create_daily_challenge($1, $2::date, $3::public.exam_type, $4::uuid[]) AS id`,
    [userId, date, examType, `{${ids.join(",")}}`],
  ).then((rows) => rows[0].id);
const start = (userId: string, challengeId: string) =>
  serviceCall<{ id: string }>(
    db,
    `SELECT public.start_challenge_session($1, $2, 10, $3::date) AS id`,
    [userId, challengeId, DAY],
  ).then((rows) => rows[0].id);
const view = (userId: string, date = DAY) =>
  serviceCall<Record<string, unknown>>(
    db,
    `SELECT * FROM public.get_daily_challenge_view($1, $2::date)`,
    [userId, date],
  );
const answerAll = async (userId: string, examId: string, ids: string[], letter = "A") => {
  for (const id of ids) {
    await serviceCall(db, `SELECT public.save_exam_answer($1, $2, $3, 10, $4, null, null, null)`, [
      userId,
      examId,
      id,
      letter,
    ]);
  }
};

beforeAll(async () => {
  db = await createTestDb();
  alice = await db.createUser("alice-ch@example.com");
  bob = await db.createUser("bob-ch@example.com");
  rn = await Promise.all(Array.from({ length: 6 }, () => addQuestion(db, { correct: "A" })));
  rm = await addQuestion(db, { examType: "RM" });
  retired = await addQuestion(db);
  await db.admin(`UPDATE public.questions SET status = 'retired' WHERE id = $1`, [retired]);
});
afterAll(() => db.pg.close());

describe("create_daily_challenge", () => {
  it("stores the question set once for a student and day, and returns the same challenge again", async () => {
    const first = await create(alice, rn.slice(0, 5));
    const again = await create(alice, rn.slice(1, 6)); // a different set is ignored: the instance is fixed
    expect(again).toBe(first);
    const [row] = await db.admin<{ question_ids: string[] }>(
      `SELECT question_ids FROM public.daily_challenges WHERE id = $1`,
      [first],
    );
    expect(row.question_ids).toEqual(rn.slice(0, 5));
  });

  it("gives each student their own challenge, and a new one the next day", async () => {
    const mine = await create(alice, rn.slice(0, 5));
    const bobs = await create(bob, rn.slice(0, 5));
    const tomorrow = await create(alice, rn.slice(0, 5), "2026-10-07");
    expect(new Set([mine, bobs, tomorrow]).size).toBe(3);
  });

  it.each([
    ["an empty set", () => []],
    ["a repeated question", () => [rn[0], rn[0]]],
    ["a question of the other exam", () => [rn[0], rm]],
    ["a retired question", () => [rn[0], retired]],
    ["a question that does not exist", () => [rn[0], "00000000-0000-4000-8000-000000000000"]],
    ["too many questions", () => Array.from({ length: 21 }, () => rn[0])],
  ])("refuses %s", async (_label, ids) => {
    const carol = await db.createUser(`carol-${Math.random()}@example.com`);
    await expect(create(carol, ids())).rejects.toThrow(/invalid_question_set/);
  });

  it("refuses a student who has no profile", async () => {
    await expect(create("00000000-0000-4000-8000-000000000001", rn.slice(0, 5))).rejects.toThrow(
      /profile_not_found/,
    );
  });
});

describe("start_challenge_session", () => {
  it("starts a daily-challenge session with the challenge's questions in order, and links it", async () => {
    const dave = await db.createUser("dave-ch@example.com");
    const challenge = await create(dave, rn.slice(0, 5));
    const examId = await start(dave, challenge);

    const [exam] = await db.admin<{
      session_type: string;
      total_questions: number;
      user_id: string;
    }>(`SELECT session_type, total_questions, user_id FROM public.exams WHERE id = $1`, [examId]);
    expect(exam).toMatchObject({
      session_type: "daily_challenge",
      total_questions: 5,
      user_id: dave,
    });
    const items = await db.admin<{ question_id: string }>(
      `SELECT question_id FROM public.exam_answers WHERE exam_id = $1 ORDER BY position`,
      [examId],
    );
    expect(items.map((i) => i.question_id)).toEqual(rn.slice(0, 5));
    const [linked] = await db.admin<{ exam_id: string }>(
      `SELECT exam_id FROM public.daily_challenges WHERE id = $1`,
      [challenge],
    );
    expect(linked.exam_id).toBe(examId);
  });

  it("counts the questions against the day's allowance", async () => {
    const erin = await db.createUser("erin-ch@example.com");
    await start(erin, await create(erin, rn.slice(0, 5)));
    const [profile] = await db.admin<{ questions_today: number }>(
      `SELECT questions_today FROM public.profiles WHERE id = $1`,
      [erin],
    );
    expect(profile.questions_today).toBe(5);
  });

  it("returns the same session when asked again, without starting another", async () => {
    const fay = await db.createUser("fay-ch@example.com");
    const challenge = await create(fay, rn.slice(0, 5));
    const first = await start(fay, challenge);
    expect(await start(fay, challenge)).toBe(first);
    const [{ n }] = await db.admin<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.exams WHERE user_id = $1`,
      [fay],
    );
    expect(n).toBe("1");
  });

  it("will not start someone else's challenge", async () => {
    const gus = await db.createUser("gus-ch@example.com");
    const theirs = await create(gus, rn.slice(0, 5));
    await expect(start(bob, theirs)).rejects.toThrow(/challenge_not_found/);
  });

  it("will not start while another exam is in progress", async () => {
    const hana = await db.createUser("hana-ch@example.com");
    await serviceCall(
      db,
      `SELECT public.start_exam_session($1, 'RN', 'All Areas', 'mixed', 30, '{}', $2::uuid[], $3::date)`,
      [hana, `{${rn[5]}}`, DAY],
    );
    await expect(start(hana, await create(hana, rn.slice(0, 5)))).rejects.toThrow(
      /active_session_exists/,
    );
  });
});

describe("get_daily_challenge_view", () => {
  it("reports not started, in progress and completed with the score", async () => {
    const ivy = await db.createUser("ivy-ch@example.com");
    expect(await view(ivy)).toEqual([]);

    const challenge = await create(ivy, rn.slice(0, 4));
    expect((await view(ivy))[0]).toMatchObject({
      id: challenge,
      total_questions: 4,
      exam_id: null,
      exam_status: null,
    });

    const examId = await start(ivy, challenge);
    expect((await view(ivy))[0]).toMatchObject({ exam_id: examId, exam_status: "in_progress" });

    await answerAll(ivy, examId, rn.slice(0, 3));
    await serviceCall(db, `SELECT public.submit_exam_session($1, $2)`, [ivy, examId]);
    expect((await view(ivy))[0]).toMatchObject({ exam_status: "completed", correct_count: 3 });
    expect(Number((await view(ivy))[0].score_pct)).toBe(75);
  });

  it("shows a student only their own challenge", async () => {
    expect((await view(bob)).every((row) => row.id !== undefined)).toBe(true);
    const nobody = await db.createUser("nobody-ch@example.com");
    expect(await view(nobody)).toEqual([]);
  });
});

describe("get_unpaid_daily_challenges", () => {
  it("lists completed challenges that have no XP entry, until one is recorded", async () => {
    const jo = await db.createUser("jo-ch@example.com");
    const challenge = await create(jo, rn.slice(0, 5));
    const examId = await start(jo, challenge);
    const unpaid = () =>
      serviceCall<{ challenge_id: string }>(
        db,
        `SELECT * FROM public.get_unpaid_daily_challenges($1, 50)`,
        [jo],
      );

    expect(await unpaid()).toEqual([]); // still in progress
    await answerAll(jo, examId, rn.slice(0, 5));
    await serviceCall(db, `SELECT public.submit_exam_session($1, $2)`, [jo, examId]);
    expect((await unpaid()).map((r) => r.challenge_id)).toEqual([challenge]);

    await serviceCall(db, `SELECT public.record_xp_events($1, $2::jsonb)`, [
      jo,
      JSON.stringify([{ source_type: "daily_challenge", source_id: challenge, xp: 50 }]),
    ]);
    expect(await unpaid()).toEqual([]);
  });

  it("counts completed challenges in the engagement snapshot", async () => {
    const [{ s }] = await serviceCall<{ s: Record<string, number> }>(
      db,
      `SELECT public.get_engagement_snapshot($1, 10, 5) AS s`,
      [bob],
    );
    expect(s.daily_challenges_completed).toBe(0);
    const jo = (
      await db.admin<{ id: string }>(`SELECT id FROM auth.users WHERE email = 'jo-ch@example.com'`)
    )[0].id;
    const [{ s: joSnapshot }] = await serviceCall<{ s: Record<string, number> }>(
      db,
      `SELECT public.get_engagement_snapshot($1, 10, 5) AS s`,
      [jo],
    );
    expect(joSnapshot.daily_challenges_completed).toBe(1);
  });
});

describe("privileges", () => {
  it("lets a student read only their own challenges", async () => {
    const own = await db.as<{ user_id: string }>(
      "authenticated",
      alice,
      `SELECT DISTINCT user_id FROM public.daily_challenges`,
    );
    expect(own.map((r) => r.user_id)).toEqual([alice]);
  });

  it.each([
    [
      "insert a challenge",
      `INSERT INTO public.daily_challenges (user_id, challenge_date, exam_type, question_ids) VALUES ($1, '2026-12-01', 'RN', '{}')`,
    ],
    [
      "change a challenge",
      `UPDATE public.daily_challenges SET question_ids = '{}' WHERE user_id = $1`,
    ],
    ["delete a challenge", `DELETE FROM public.daily_challenges WHERE user_id = $1`],
  ])("does not let a student %s", async (_label, sql) => {
    await expect(db.as("authenticated", alice, sql, [alice])).rejects.toThrow(/permission denied/i);
  });

  it.each([
    [`SELECT public.create_daily_challenge($1, '2026-10-06', 'RN', '{}')`],
    [`SELECT public.start_challenge_session($1, $1, 10, '2026-10-06')`],
    [`SELECT * FROM public.get_daily_challenge_view($1, '2026-10-06')`],
    [`SELECT * FROM public.get_unpaid_daily_challenges($1, 10)`],
  ])("does not let a student call %s", async (sql) => {
    await expect(db.as("authenticated", alice, sql, [alice])).rejects.toThrow(/permission denied/i);
  });
});
