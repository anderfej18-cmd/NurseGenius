import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addQuestion, serviceCall } from "./fixtures";
import { createTestDb, type TestDb } from "./pglite-db";

let db: TestDb;
let alice: string;
let bob: string;
let carol: string;
let aliceBob: string; // friendship id
let rn: string[];
let rm: string;
let retired: string;

const TODAY = "2026-10-06";
const MAX_OPEN = 3;
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

const befriend = async (a: string, b: string, bName: string) => {
  const [{ friendship_id }] = await serviceCall<{ friendship_id: string }>(
    db,
    `SELECT * FROM public.request_friend($1, $2, 10, 10)`,
    [a, bName],
  );
  await serviceCall(db, `SELECT public.respond_friend_request($1, $2, true, 10)`, [
    b,
    friendship_id,
  ]);
  return friendship_id;
};
const create = (
  userId: string,
  friendshipId: string,
  ids: string[],
  options: { examType?: string; expiresAt?: string; maxOpen?: number } = {},
) =>
  serviceCall<{ id: string }>(
    db,
    `SELECT public.create_friend_challenge($1, $2, $3::public.exam_type, $4::uuid[], $5::timestamptz, $6) AS id`,
    [
      userId,
      friendshipId,
      options.examType ?? "RN",
      `{${ids.join(",")}}`,
      options.expiresAt ?? inDays(7),
      options.maxOpen ?? MAX_OPEN,
    ],
  ).then((rows) => rows[0].id);
const decline = (userId: string, challengeId: string) =>
  serviceCall(db, `SELECT public.decline_friend_challenge($1, $2)`, [userId, challengeId]);
const start = (userId: string, challengeId: string) =>
  serviceCall<{ id: string }>(
    db,
    `SELECT public.start_friend_challenge_session($1, $2, 15, $3::date) AS id`,
    [userId, challengeId, TODAY],
  ).then((rows) => rows[0].id);
const answer = (userId: string, examId: string, questionId: string, letter: string) =>
  serviceCall(db, `SELECT public.save_exam_answer($1, $2, $3, 10, $4, null, null, null)`, [
    userId,
    examId,
    questionId,
    letter,
  ]);
const submit = (userId: string, examId: string) =>
  serviceCall(db, `SELECT public.submit_exam_session($1, $2)`, [userId, examId]);
const views = (userId: string, challengeId: string | null = null, limit = 50, offset = 0) =>
  serviceCall<Record<string, unknown>>(
    db,
    `SELECT * FROM public.get_friend_challenge_views($1, $2, $3, $4)`,
    [userId, limit, offset, challengeId],
  );
const play = async (userId: string, challengeId: string, ids: string[], right: number) => {
  const examId = await start(userId, challengeId);
  for (const [index, id] of ids.entries())
    await answer(userId, examId, id, index < right ? "A" : "B");
  await submit(userId, examId);
  return examId;
};
const reset = async () => {
  await db.admin(`DELETE FROM public.friend_challenges`);
  await db.admin(`DELETE FROM public.exam_answers`);
  await db.admin(`DELETE FROM public.exams`);
};

beforeAll(async () => {
  db = await createTestDb();
  [alice, bob, carol] = await Promise.all(
    ["alice", "bob", "carol"].map((name) => db.createUser(`${name}-fc@example.com`)),
  );
  for (const [id, name] of [
    [alice, "alice"],
    [bob, "bob"],
    [carol, "carol"],
  ]) {
    await db.admin(`UPDATE public.profiles SET username = $2 WHERE id = $1`, [id, name]);
  }
  aliceBob = await befriend(alice, bob, "bob");
  rn = await Promise.all(Array.from({ length: 5 }, () => addQuestion(db, { correct: "A" })));
  rm = await addQuestion(db, { examType: "RM" });
  retired = await addQuestion(db);
  await db.admin(`UPDATE public.questions SET status = 'retired' WHERE id = $1`, [retired]);
});
afterAll(() => db.pg.close());

describe("create_friend_challenge", () => {
  it("stores the question set for a friend, whichever friend asks", async () => {
    await reset();
    const mine = await create(alice, aliceBob, rn);
    const theirs = await create(bob, aliceBob, rn);
    const [first] = await db.admin<{
      challenger_id: string;
      opponent_id: string;
      question_ids: string[];
    }>(
      `SELECT challenger_id, opponent_id, question_ids FROM public.friend_challenges WHERE id = $1`,
      [mine],
    );
    expect(first).toEqual({ challenger_id: alice, opponent_id: bob, question_ids: rn });
    const [second] = await db.admin<{ challenger_id: string; opponent_id: string }>(
      `SELECT challenger_id, opponent_id FROM public.friend_challenges WHERE id = $1`,
      [theirs],
    );
    expect(second).toEqual({ challenger_id: bob, opponent_id: alice });
  });

  it("refuses anyone who is not one of the two friends, and friends who have not accepted", async () => {
    await reset();
    await expect(create(carol, aliceBob, rn)).rejects.toThrow(/friendship_not_found/);
    const pending = await serviceCall<{ friendship_id: string }>(
      db,
      `SELECT * FROM public.request_friend($1, 'carol', 10, 10)`,
      [alice],
    );
    await expect(create(alice, pending[0].friendship_id, rn)).rejects.toThrow(
      /friendship_not_found/,
    );
    await db.admin(`DELETE FROM public.friendships WHERE id = $1`, [pending[0].friendship_id]);
  });

  it.each([
    ["no questions", () => []],
    ["the same question twice", () => [rn[0], rn[0]]],
    ["a retired question", () => [rn[0], retired]],
    ["a question of the other exam", () => [rn[0], rm]],
    ["more than 20 questions", () => Array.from({ length: 21 }, () => rn[0])],
  ])("refuses %s", async (_label, ids) => {
    await reset();
    await expect(create(alice, aliceBob, ids())).rejects.toThrow(
      /invalid_question_set|violates check constraint/,
    );
  });

  it("limits the challenges a student can have waiting for an answer", async () => {
    await reset();
    for (let i = 0; i < MAX_OPEN; i += 1) await create(alice, aliceBob, rn);
    await expect(create(alice, aliceBob, rn)).rejects.toThrow(/challenge_limit/);
    // the other student's own challenges are counted separately
    await expect(create(bob, aliceBob, rn)).resolves.toBeTruthy();
  });

  it("does not count a challenge that was answered or declined", async () => {
    await reset();
    const first = await create(alice, aliceBob, rn);
    await create(alice, aliceBob, rn);
    await create(alice, aliceBob, rn);
    await decline(bob, first);
    await expect(create(alice, aliceBob, rn)).resolves.toBeTruthy();
  });
});

describe("decline_friend_challenge", () => {
  it("lets only the challenged student decline, and only before starting", async () => {
    await reset();
    const id = await create(alice, aliceBob, rn);
    await expect(decline(alice, id)).rejects.toThrow(/challenge_not_found/);
    await expect(decline(carol, id)).rejects.toThrow(/challenge_not_found/);
    await decline(bob, id);
    await expect(decline(bob, id)).rejects.toThrow(/challenge_not_found/);

    const other = await create(alice, aliceBob, rn);
    await start(bob, other);
    await expect(decline(bob, other)).rejects.toThrow(/challenge_not_found/);
  });
});

describe("start_friend_challenge_session", () => {
  it("starts each student's own session over the stored questions, in order", async () => {
    await reset();
    const id = await create(alice, aliceBob, rn);
    const mine = await start(alice, id);
    const theirs = await start(bob, id);
    expect(mine).not.toBe(theirs);
    for (const [examId, owner] of [
      [mine, alice],
      [theirs, bob],
    ] as const) {
      const [exam] = await db.admin<{
        user_id: string;
        session_type: string;
        category: string;
        total_questions: number;
      }>(
        `SELECT user_id, session_type, category, total_questions FROM public.exams WHERE id = $1`,
        [examId],
      );
      expect(exam).toEqual({
        user_id: owner,
        session_type: "custom",
        category: "Friend challenge",
        total_questions: rn.length,
      });
      const order = await db.admin<{ question_id: string }>(
        `SELECT question_id FROM public.exam_answers WHERE exam_id = $1 ORDER BY position`,
        [examId],
      );
      expect(order.map((row) => row.question_id)).toEqual(rn);
    }
  });

  it("returns the session already started instead of starting another", async () => {
    await reset();
    const id = await create(alice, aliceBob, rn);
    expect(await start(alice, id)).toBe(await start(alice, id));
  });

  it("refuses a student who is not in the challenge", async () => {
    await reset();
    const id = await create(alice, aliceBob, rn);
    await expect(start(carol, id)).rejects.toThrow(/challenge_not_found/);
  });

  it("refuses to start a declined or expired challenge", async () => {
    await reset();
    const declined = await create(alice, aliceBob, rn);
    await decline(bob, declined);
    await expect(start(bob, declined)).rejects.toThrow(/challenge_closed/);
    await expect(start(alice, declined)).rejects.toThrow(/challenge_closed/);

    const expired = await create(alice, aliceBob, rn);
    await db.admin(
      `UPDATE public.friend_challenges SET created_at = now() - interval '2 days', expires_at = now() - interval '1 second' WHERE id = $1`,
      [expired],
    );
    await expect(start(bob, expired)).rejects.toThrow(/challenge_closed/);
  });

  it("still returns a session started before the challenge expired", async () => {
    await reset();
    const id = await create(alice, aliceBob, rn);
    const examId = await start(alice, id);
    await db.admin(
      `UPDATE public.friend_challenges SET created_at = now() - interval '2 days', expires_at = now() - interval '1 second' WHERE id = $1`,
      [id],
    );
    expect(await start(alice, id)).toBe(examId);
  });

  it("applies the usual session rules: one active session, and the day's allowance", async () => {
    await reset();
    const id = await create(alice, aliceBob, rn);
    const other = await create(alice, aliceBob, rn);
    await start(alice, id);
    await expect(start(alice, other)).rejects.toThrow(/active_session_exists/);

    const [{ questions_today }] = await db.admin<{ questions_today: number }>(
      `SELECT questions_today FROM public.profiles WHERE id = $1`,
      [alice],
    );
    expect(questions_today).toBeGreaterThanOrEqual(rn.length);
  });
});

describe("get_friend_challenge_views", () => {
  it("shows each student the other's username and role, and nobody else the challenge", async () => {
    await reset();
    const id = await create(alice, aliceBob, rn);
    const [mine] = await views(alice, id);
    const [theirs] = await views(bob, id);
    expect(mine).toMatchObject({
      id,
      role: "challenger",
      opponent_username: "bob",
      total_questions: 5,
    });
    expect(theirs).toMatchObject({ id, role: "opponent", opponent_username: "alice" });
    expect(await views(carol, id)).toEqual([]);
    expect(await views(carol)).toEqual([]);
  });

  it("keeps the other student's score hidden until the viewer has finished", async () => {
    await reset();
    const id = await create(alice, aliceBob, rn);
    await play(alice, id, rn, 4);

    const [forBob] = await views(bob, id);
    expect(forBob).toMatchObject({
      their_exam_status: "completed",
      their_correct: null,
      their_score_pct: null,
      my_exam_status: null,
    });

    await play(bob, id, rn, 2);
    const [afterBob] = await views(bob, id);
    expect(afterBob).toMatchObject({
      my_correct: 2,
      their_correct: 4,
      their_exam_status: "completed",
    });
    expect(Number(afterBob.their_score_pct)).toBe(80);
    const [afterAlice] = await views(alice, id);
    expect(afterAlice).toMatchObject({ my_correct: 4, their_correct: 2 });
  });

  it("does not show the other student's score while the viewer is still playing", async () => {
    await reset();
    const id = await create(alice, aliceBob, rn);
    await play(alice, id, rn, 5);
    await start(bob, id);
    const [forBob] = await views(bob, id);
    expect(forBob).toMatchObject({
      my_exam_status: "in_progress",
      their_correct: null,
      their_score_pct: null,
    });
  });

  it("finishes an exam that ran out of time, so the result does not wait on a student who left", async () => {
    await reset();
    const id = await create(alice, aliceBob, rn);
    await play(alice, id, rn, 3);
    const abandoned = await start(bob, id);
    await answer(bob, abandoned, rn[0], "A");
    await db.admin(
      `UPDATE public.exams SET deadline_at = now() - interval '1 minute' WHERE id = $1`,
      [abandoned],
    );

    const [forAlice] = await views(alice, id);
    expect(forAlice).toMatchObject({
      my_correct: 3,
      their_exam_status: "completed",
      their_correct: 1,
    });
    const [exam] = await db.admin<{ status: string }>(
      `SELECT status FROM public.exams WHERE id = $1`,
      [abandoned],
    );
    expect(exam.status).toBe("completed");
  });

  it("lists the newest first, a page at a time, only the student's own", async () => {
    await reset();
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const id = await create(alice, aliceBob, rn, { maxOpen: 10 });
      await db.admin(
        `UPDATE public.friend_challenges SET created_at = now() - make_interval(mins => $2) WHERE id = $1`,
        [id, 10 - i],
      );
      ids.push(id);
    }
    expect((await views(alice, null, 2, 0)).map((row) => row.id)).toEqual([ids[2], ids[1]]);
    expect((await views(alice, null, 2, 2)).map((row) => row.id)).toEqual([ids[0]]);
    expect((await views(bob)).length).toBe(3);
    expect(await views(carol)).toEqual([]);
  });

  it("clamps an oversized page", async () => {
    await reset();
    expect(await views(alice, null, 100_000, 0)).toEqual([]);
  });
});

describe("access", () => {
  it("is closed to a signed-in student: no table reads or writes, no function calls", async () => {
    await reset();
    const id = await create(alice, aliceBob, rn);
    await expect(
      db.as("authenticated", alice, `SELECT * FROM public.friend_challenges`),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.as("authenticated", alice, `UPDATE public.friend_challenges SET declined_at = now()`),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.as("authenticated", bob, `SELECT public.decline_friend_challenge($1, $2)`, [bob, id]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.as("authenticated", bob, `SELECT * FROM public.get_friend_challenge_views($1, 10, 0)`, [
        bob,
      ]),
    ).rejects.toThrow(/permission denied/);
    await expect(db.as("anon", null, `SELECT * FROM public.friend_challenges`)).rejects.toThrow(
      /permission denied/,
    );
  });

  it("keeps the challenged student's exam only for them, and removes challenges with a student", async () => {
    await reset();
    const dave = await db.createUser("dave-fc@example.com");
    await db.admin(`UPDATE public.profiles SET username = 'dave' WHERE id = $1`, [dave]);
    const friendship = await befriend(alice, dave, "dave");
    await create(alice, friendship, rn);
    await db.admin(`DELETE FROM auth.users WHERE id = $1`, [dave]);
    expect(
      await db.admin(`SELECT 1 FROM public.friend_challenges WHERE opponent_id = $1`, [dave]),
    ).toEqual([]);
  });
});
