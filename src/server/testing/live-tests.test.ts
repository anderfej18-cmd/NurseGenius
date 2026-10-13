import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addQuestion, serviceCall } from "./fixtures";
import { createTestDb, type TestDb } from "./pglite-db";

// Migration 20261012100100: scheduled, server-timed shared tests ("live tests"), random selection per
// subcategory, saved answers, resume, role-aware lists, and an audited de-duplicating import.

let db: TestDb;
let owner: string;
let other: string;
let central: string;
let student: string;

const hashOf = (label: string) => label.padEnd(64, "0");
const q = (n: number, correct = "A") => ({
  question_text: `Q${n}?`,
  option_a: "a",
  option_b: "b",
  option_c: "c",
  option_d: "d",
  correct_answer: correct,
  rationale: n === 1 ? "Because." : null,
});

interface CreateOptions {
  by?: string;
  mode?: "existing" | "upload";
  questions?: unknown[];
  allocations?: unknown[];
  startsIn?: string;
  endsIn?: string;
  minutes?: number;
  examType?: "RN" | "RM";
  title?: string;
}
let counter = 0;
const create = async (
  o: CreateOptions = {},
): Promise<{ id: string; token: string; hash: string }> => {
  counter += 1;
  const hash = hashOf(`t${counter}-`);
  const token = `token-${counter}`;
  const rows = await serviceCall<{ id: string }>(
    db,
    `SELECT public.create_live_test($1, $2, 'desc', $3, $4, $5, now() + $6::interval, now() + $7::interval, $8, $9, $10::jsonb, $11::jsonb) AS id`,
    [
      o.by ?? owner,
      o.title ?? "Mock",
      o.examType ?? "RN",
      o.mode ?? "upload",
      o.minutes ?? 30,
      o.startsIn ?? "-1 minute",
      o.endsIn ?? "1 day",
      hash,
      token,
      JSON.stringify(o.questions ?? [q(1), q(2), q(3), q(4), q(5)]),
      JSON.stringify(o.allocations ?? []),
    ],
  );
  return { id: rows[0].id, token, hash };
};

const call = <T>(sql: string, params: unknown[] = []) => serviceCall<T>(db, sql, params);
const questionIds = async (testId: string) =>
  (
    await db.admin<{ id: string }>(
      `SELECT id FROM public.custom_test_questions WHERE custom_test_id = $1 ORDER BY position`,
      [testId],
    )
  ).map((row) => row.id);
let attempts = 0;
const start = async (hash: string, email = "taker@example.com") => {
  attempts += 1;
  const access = `key-${attempts}`.padEnd(64, "k");
  const [row] = await call<{ r: { attempt_id: string } }>(
    `SELECT public.start_shared_attempt($1, $2, $3) AS r`,
    [hash, email, access],
  );
  return { id: row.r.attempt_id, access };
};
const submit = (attempt: string, access: string, answers: unknown) =>
  call<{
    r: { score: number; correct: number; total: number; results: Array<{ is_correct: boolean }> };
  }>(`SELECT public.submit_shared_attempt($1, $2, $3::jsonb) AS r`, [
    attempt,
    access,
    JSON.stringify(answers),
  ]).then((rows) => rows[0].r);
const view = (attempt: string, access: string) =>
  call<{
    r: Record<string, unknown> & {
      status: string;
      questions: Array<{ id: string; answer: string | null; flagged: boolean }>;
    };
  }>(`SELECT public.get_shared_attempt($1, $2) AS r`, [attempt, access]).then((rows) => rows[0].r);

beforeAll(async () => {
  db = await createTestDb();
  [owner, other, central, student] = await Promise.all(
    ["own", "oth", "cen", "stu"].map((n) => db.createUser(`${n}-live@example.com`)),
  );
  await db.admin(
    `INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'admin'), ($2, 'admin'), ($3, 'central_admin')`,
    [owner, other, central],
  );
  await db.admin(`UPDATE public.profiles SET username = 'ownerName' WHERE id = $1`, [owner]);
});
afterAll(() => db.pg.close());

describe("create_live_test from an upload", () => {
  it("stores the test, its schedule, its link and every question in order, as published", async () => {
    const test = await create({ startsIn: "10 minutes" });
    const [row] = await db.admin<{
      status: string;
      owner_id: string;
      share_token: string;
      upcoming: boolean;
    }>(
      `SELECT status, owner_id, share_token, starts_at > now() AS upcoming FROM public.custom_tests WHERE id = $1`,
      [test.id],
    );
    expect(row).toEqual({
      status: "published",
      owner_id: owner,
      share_token: test.token,
      upcoming: true,
    });
    const rows = await db.admin<{ position: number; question_text: string; source_kind: string }>(
      `SELECT position, question_text, source_kind FROM public.custom_test_questions WHERE custom_test_id = $1 ORDER BY position`,
      [test.id],
    );
    expect(rows.map((r) => [r.position, r.question_text, r.source_kind])).toEqual(
      [1, 2, 3, 4, 5].map((n) => [n - 1, `Q${n}?`, "custom"]),
    );
  });

  it("records the creation in the audit log", async () => {
    const test = await create();
    const [entry] = await db.admin<{ actor_id: string; details: { questions: number } }>(
      `SELECT actor_id, details FROM public.admin_audit_log WHERE target_id = $1 AND action = 'live_test.create'`,
      [test.id],
    );
    expect(entry.actor_id).toBe(owner);
    expect(entry.details.questions).toBe(5);
  });

  it("leaves nothing behind when a question is invalid or the schedule is wrong", async () => {
    const before = (await db.admin(`SELECT 1 FROM public.custom_tests`)).length;
    await expect(create({ questions: [q(1), q(2, "Z")] })).rejects.toThrow(/invalid_question_set/);
    await expect(create({ endsIn: "-1 hour" })).rejects.toThrow(/invalid_schedule/);
    await expect(create({ startsIn: "2 days", endsIn: "1 day" })).rejects.toThrow(
      /invalid_schedule/,
    );
    await expect(create({ minutes: 9 })).rejects.toThrow(/invalid_schedule/);
    await expect(create({ minutes: 181 })).rejects.toThrow(/invalid_schedule/);
    await expect(create({ questions: [] })).rejects.toThrow(/invalid_question_set/);
    expect((await db.admin(`SELECT 1 FROM public.custom_tests`)).length).toBe(before);
  });

  it("refuses more than 250 questions and a caller who is not an admin", async () => {
    await expect(
      create({ questions: Array.from({ length: 251 }, (_, i) => q(i + 1)) }),
    ).rejects.toThrow(/invalid_question_set/);
    await expect(create({ by: student })).rejects.toThrow(/not_authorized/);
  });
});

describe("create_live_test from the question bank", () => {
  beforeAll(async () => {
    for (let i = 0; i < 6; i++) await addQuestion(db, { topic: "Pool A" });
    for (let i = 0; i < 3; i++) await addQuestion(db, { topic: "Pool B" });
    for (let i = 0; i < 2; i++) await addQuestion(db, { topic: "Pool RM", examType: "RM" });
    // Not eligible: retired, and incomplete.
    const retired = await addQuestion(db, { topic: "Pool A" });
    await db.admin(`UPDATE public.questions SET status = 'retired' WHERE id = $1`, [retired]);
    await db.admin(
      `INSERT INTO public.questions (exam_type, topic, question_text, option_a, option_b, option_c, option_d, correct_answer)
       VALUES ('RN', 'Pool A', 'Broken?', 'a', '', 'c', 'd', 'A')`,
    );
  });

  const counts = async (testId: string) =>
    (
      await db.admin<{ topic: string; n: number }>(
        `SELECT s.topic, count(*)::int AS n FROM public.custom_test_questions c
           JOIN public.questions s ON s.id = c.source_question_id WHERE c.custom_test_id = $1 GROUP BY 1 ORDER BY 1`,
        [testId],
      )
    ).map((r) => [r.topic, r.n]);

  it("draws the requested number from each subcategory, from active complete questions only", async () => {
    const test = await create({
      mode: "existing",
      allocations: [
        { topic: "Pool A", count: 6 },
        { topic: "Pool B", count: 2 },
      ],
    });
    expect(await counts(test.id)).toEqual([
      ["Pool A", 6],
      ["Pool B", 2],
    ]);
    const rows = await db.admin<{ position: number; source_kind: string; copies: number }>(
      `SELECT position, source_kind, count(*) OVER (PARTITION BY source_question_id)::int AS copies
         FROM public.custom_test_questions WHERE custom_test_id = $1 ORDER BY position`,
      [test.id],
    );
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(rows.every((r) => r.source_kind === "existing" && r.copies === 1)).toBe(true);
  });

  it("is random: different draws from one pool do not always match", async () => {
    const drawn = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const test = await create({ mode: "existing", allocations: [{ topic: "Pool A", count: 3 }] });
      const ids = await db.admin<{ source_question_id: string }>(
        `SELECT source_question_id FROM public.custom_test_questions WHERE custom_test_id = $1 ORDER BY source_question_id`,
        [test.id],
      );
      drawn.add(ids.map((r) => r.source_question_id).join());
    }
    expect(drawn.size).toBeGreaterThan(1);
  });

  it("refuses a count above the pool, naming the subcategory and how many exist, and stores nothing", async () => {
    const before = (await db.admin(`SELECT 1 FROM public.custom_tests`)).length;
    await expect(
      create({ mode: "existing", allocations: [{ topic: "Pool B", count: 4 }] }),
    ).rejects.toThrow(/allocation_exceeds_pool:Pool B:3/);
    // The retired and the incomplete question of Pool A are not in the pool: 6 is the most.
    await expect(
      create({ mode: "existing", allocations: [{ topic: "Pool A", count: 7 }] }),
    ).rejects.toThrow(/allocation_exceeds_pool:Pool A:6/);
    expect((await db.admin(`SELECT 1 FROM public.custom_tests`)).length).toBe(before);
  });

  it("keeps to the exam type and refuses repeated subcategories, zero counts and a total above 250", async () => {
    await expect(
      create({ mode: "existing", examType: "RN", allocations: [{ topic: "Pool RM", count: 1 }] }),
    ).rejects.toThrow(/allocation_exceeds_pool:Pool RM:0/);
    await expect(
      create({
        mode: "existing",
        allocations: [
          { topic: "Pool B", count: 1 },
          { topic: "Pool B", count: 1 },
        ],
      }),
    ).rejects.toThrow(/invalid_question_set/);
    await expect(
      create({ mode: "existing", allocations: [{ topic: "Pool B", count: 0 }] }),
    ).rejects.toThrow(/invalid_question_set/);
    await db.admin(
      `INSERT INTO public.questions (exam_type, topic, question_text, option_a, option_b, option_c, option_d, correct_answer)
       SELECT 'RN', 'Big', 'Big ' || g || '?', 'a', 'b', 'c', 'd', 'A' FROM generate_series(1, 251) g`,
    );
    await expect(
      create({ mode: "existing", allocations: [{ topic: "Big", count: 251 }] }),
    ).rejects.toThrow(/invalid_question_set/);
    expect(
      await counts(
        (await create({ mode: "existing", allocations: [{ topic: "Big", count: 250 }] })).id,
      ),
    ).toEqual([["Big", 250]]);
  });

  it("is a snapshot: editing or retiring the bank question later does not change the test", async () => {
    const test = await create({ mode: "existing", allocations: [{ topic: "Pool B", count: 3 }] });
    await db.admin(
      `UPDATE public.questions SET question_text = 'CHANGED', correct_answer = 'D', status = 'retired' WHERE topic = 'Pool B'`,
    );
    const rows = await db.admin<{ question_text: string; correct_answer: string }>(
      `SELECT question_text, correct_answer FROM public.custom_test_questions WHERE custom_test_id = $1`,
      [test.id],
    );
    expect(rows.every((r) => r.question_text !== "CHANGED" && r.correct_answer === "A")).toBe(true);
  });
});

describe("the schedule, by the database clock", () => {
  const state = async (hash: string) =>
    (
      await call<{ r: { state: string; question_count?: number } }>(
        `SELECT public.get_shared_test_state($1) AS r`,
        [hash],
      )
    )[0].r;

  it("is upcoming before the start, live inside the window, closed after it, and closed for an unknown link", async () => {
    expect((await state((await create({ startsIn: "1 hour" })).hash)).state).toBe("upcoming");
    expect((await state((await create()).hash)).state).toBe("live");
    const lapsed = await create();
    await db.admin(
      `UPDATE public.custom_tests SET starts_at = now() - interval '2 days', expires_at = now() - interval '1 day' WHERE id = $1`,
      [lapsed.id],
    );
    expect((await state(lapsed.hash)).state).toBe("closed");
    expect((await state(hashOf("nothing"))).state).toBe("closed");
  });

  it("sends the shape of the test but never its questions", async () => {
    const info = await state((await create()).hash);
    expect(info).toMatchObject({ question_count: 5 });
    expect(JSON.stringify(info)).not.toMatch(/Q1\?|correct_answer/);
  });

  it("lets a candidate start only inside the window", async () => {
    await expect(start((await create({ startsIn: "1 hour" })).hash)).rejects.toThrow(
      /test_not_started/,
    );
    const lapsed = await create();
    await db.admin(
      `UPDATE public.custom_tests SET starts_at = now() - interval '2 days', expires_at = now() - interval '1 day' WHERE id = $1`,
      [lapsed.id],
    );
    await expect(start(lapsed.hash)).rejects.toThrow(/test_closed/);
    await expect(start(hashOf("nothing"))).rejects.toThrow(/test_not_found/);
    await db.admin(`UPDATE public.custom_tests SET status = 'archived' WHERE id = $1`, [
      (await create()).id,
    ]);
    expect((await start((await create()).hash)).id).toBeTruthy();
  });
});

describe("answers are saved on the server and the timer is enforced there", () => {
  const save = (
    attempt: string,
    access: string,
    question: string,
    answer: string | null,
    flagged = false,
  ) =>
    call(`SELECT public.save_shared_answer($1, $2, $3, $4, $5)`, [
      attempt,
      access,
      question,
      answer,
      flagged,
    ]);

  it("saves answers and flags as they are chosen, and a reload gets them back without the key", async () => {
    const test = await create();
    const attempt = await start(test.hash);
    const ids = await questionIds(test.id);
    await save(attempt.id, attempt.access, ids[0], "B", true);
    await save(attempt.id, attempt.access, ids[1], "c");
    await save(attempt.id, attempt.access, ids[0], "A", false);
    const seen = await view(attempt.id, attempt.access);
    expect(seen.status).toBe("in_progress");
    expect(seen.questions.map((x) => [x.answer, x.flagged])).toEqual([
      ["A", false],
      ["C", false],
      [null, false],
      [null, false],
      [null, false],
    ]);
    expect(JSON.stringify(seen)).not.toMatch(/correct_answer|Because/);
  });

  it("refuses a wrong key, a question from another test and any save after the deadline", async () => {
    const test = await create({ minutes: 10 });
    const foreign = await create();
    const attempt = await start(test.hash);
    const ids = await questionIds(test.id);
    await expect(save(attempt.id, "wrong".padEnd(64, "x"), ids[0], "A")).rejects.toThrow(
      /attempt_not_found/,
    );
    await expect(
      save(attempt.id, attempt.access, (await questionIds(foreign.id))[0], "A"),
    ).rejects.toThrow(/answers_not_in_test/);
    await db.admin(
      `UPDATE public.custom_test_attempts SET started_at = now() - interval '11 minutes' WHERE id = $1`,
      [attempt.id],
    );
    await expect(save(attempt.id, attempt.access, ids[0], "A")).rejects.toThrow(/attempt_expired/);
  });

  it("closes an attempt past its deadline from its saved answers when the candidate comes back", async () => {
    const test = await create({ minutes: 10 });
    const attempt = await start(test.hash);
    const ids = await questionIds(test.id);
    await save(attempt.id, attempt.access, ids[0], "A");
    await save(attempt.id, attempt.access, ids[1], "A");
    await db.admin(
      `UPDATE public.custom_test_attempts SET started_at = now() - interval '12 minutes' WHERE id = $1`,
      [attempt.id],
    );
    const seen = await view(attempt.id, attempt.access);
    expect(seen.status).toBe("completed");
    expect(seen.result).toMatchObject({ correct: 2, total: 5, score: 40 });
    expect(seen.questions).toEqual([]);
  });

  it("ignores what is submitted after the deadline and scores only what was saved in time", async () => {
    const test = await create({ minutes: 10 });
    const attempt = await start(test.hash);
    const ids = await questionIds(test.id);
    await save(attempt.id, attempt.access, ids[0], "A");
    await db.admin(
      `UPDATE public.custom_test_attempts SET started_at = now() - interval '12 minutes' WHERE id = $1`,
      [attempt.id],
    );
    const late = ids.map((id) => ({ question_id: id, user_answer: "A" }));
    expect((await submit(attempt.id, attempt.access, late)).correct).toBe(1);
  });
});

describe("submit_shared_attempt", () => {
  it("scores from the stored key, records every answer, and closes the attempt, all at once", async () => {
    const test = await create();
    const attempt = await start(test.hash);
    const ids = await questionIds(test.id);
    const result = await submit(attempt.id, attempt.access, [
      { question_id: ids[0], user_answer: "A" },
      { question_id: ids[1], user_answer: "B" },
      { question_id: ids[2], user_answer: "A" },
      { question_id: ids[3], user_answer: "a" },
      { question_id: ids[4], user_answer: null },
    ]);
    expect(result).toMatchObject({ correct: 3, total: 5, score: 60 });
    expect(result.results.map((r) => r.is_correct)).toEqual([true, false, true, true, false]);
  });

  it("cannot be forged: a client-claimed score or correctness is not an input at all", async () => {
    const attempt = await start((await create()).hash);
    const ids = await questionIds(
      (
        await db.admin<{ custom_test_id: string }>(
          `SELECT custom_test_id FROM public.custom_test_attempts WHERE id = $1`,
          [attempt.id],
        )
      )[0].custom_test_id,
    );
    const result = await submit(
      attempt.id,
      attempt.access,
      ids.map((id) => ({ question_id: id, user_answer: "D", is_correct: true, score: 100 })),
    );
    expect(result.correct).toBe(0);
  });

  it("refuses a second submission without changing the stored result", async () => {
    const test = await create();
    const attempt = await start(test.hash);
    const ids = await questionIds(test.id);
    await submit(
      attempt.id,
      attempt.access,
      ids.map((id) => ({ question_id: id, user_answer: "A" })),
    );
    await expect(
      submit(
        attempt.id,
        attempt.access,
        ids.map((id) => ({ question_id: id, user_answer: "B" })),
      ),
    ).rejects.toThrow(/attempt_closed/);
    const [row] = await db.admin<{ correct_count: number }>(
      `SELECT correct_count FROM public.custom_test_attempts WHERE id = $1`,
      [attempt.id],
    );
    expect(row.correct_count).toBe(5);
  });

  it("needs 80% answered before the time is up, and a wrong key or a foreign question is refused", async () => {
    const test = await create();
    const foreign = await create();
    const attempt = await start(test.hash);
    const ids = await questionIds(test.id);
    await expect(
      submit(attempt.id, attempt.access, [{ question_id: ids[0], user_answer: "A" }]),
    ).rejects.toThrow(/too_few_answered:4/);
    await expect(submit(attempt.id, "wrong".padEnd(64, "x"), [])).rejects.toThrow(
      /attempt_not_found/,
    );
    const [stranger] = await questionIds(foreign.id);
    const full = ids.map((id) => ({ question_id: id, user_answer: "A" }));
    await expect(
      submit(attempt.id, attempt.access, [
        ...full.slice(0, 4),
        { question_id: stranger, user_answer: "A" },
      ]),
    ).rejects.toThrow(/answers_not_in_test/);
    await expect(submit(attempt.id, attempt.access, [...full, full[0]])).rejects.toThrow(
      /answers_not_in_test/,
    );
  });
});

describe("republish_live_test", () => {
  const republish = (
    actor: string,
    id: string,
    hash: string,
    token: string,
    startsIn = "1 hour",
    minutes = 45,
  ) =>
    call(
      `SELECT public.republish_live_test($1, $2, $3, $4, now() + $5::interval, now() + interval '3 days', $6)`,
      [actor, id, hash, token, startsIn, minutes],
    );

  it("gives a lapsed test a new link, schedule and duration, and the old link stops working", async () => {
    const test = await create();
    await db.admin(
      `UPDATE public.custom_tests SET starts_at = now() - interval '2 days', expires_at = now() - interval '1 day' WHERE id = $1`,
      [test.id],
    );
    await republish(owner, test.id, hashOf("new1"), "new-token-1");
    const [row] = await db.admin<{
      share_token: string;
      duration_minutes: number;
      upcoming: boolean;
    }>(
      `SELECT share_token, duration_minutes, starts_at > now() AS upcoming FROM public.custom_tests WHERE id = $1`,
      [test.id],
    );
    expect(row).toEqual({ share_token: "new-token-1", duration_minutes: 45, upcoming: true });
    const old = await call<{ r: { state: string } }>(
      `SELECT public.get_shared_test_state($1) AS r`,
      [test.hash],
    );
    expect(old[0].r.state).toBe("closed");
    const [entry] = await db.admin<{ actor_id: string }>(
      `SELECT actor_id FROM public.admin_audit_log WHERE target_id = $1 AND action = 'live_test.republish'`,
      [test.id],
    );
    expect(entry.actor_id).toBe(owner);
  });

  it("is for the owner or the central admin, not another admin", async () => {
    const test = await create();
    await expect(republish(other, test.id, hashOf("new2"), "x")).rejects.toThrow(/test_not_found/);
    await republish(central, test.id, hashOf("new3"), "y");
  });

  it("validates the new schedule", async () => {
    const test = await create();
    await expect(republish(owner, test.id, hashOf("new4"), "z", "1 hour", 9)).rejects.toThrow(
      /invalid_schedule/,
    );
    await expect(
      call(
        `SELECT public.republish_live_test($1, $2, $3, 'z', now() + interval '2 days', now() + interval '1 day', 30)`,
        [owner, test.id, hashOf("new5")],
      ),
    ).rejects.toThrow(/invalid_schedule/);
  });
});

describe("lists and rankings", () => {
  it("shows a manager their own tests (the central admin all), with real counts, and a username for the owner", async () => {
    const mine = await create({ title: "Mine" });
    const theirs = await create({ by: other, title: "Theirs" });
    const attempt = await start(mine.hash, "ranked@example.com");
    await submit(
      attempt.id,
      attempt.access,
      (await questionIds(mine.id)).map((id) => ({ question_id: id, user_answer: "A" })),
    );
    const list = (actor: string) =>
      call<{
        id: string;
        owner_username: string | null;
        state: string;
        participant_count: number;
        pass_count: number;
        share_token: string;
        question_count: number;
      }>(`SELECT * FROM public.list_live_tests($1)`, [actor]);
    const own = await list(owner);
    expect(own.map((r) => r.id)).toContain(mine.id);
    expect(own.map((r) => r.id)).not.toContain(theirs.id);
    expect(own.find((r) => r.id === mine.id)).toMatchObject({
      participant_count: 1,
      pass_count: 1,
      question_count: 5,
      state: "live",
      share_token: mine.token,
      owner_username: "ownerName",
    });
    const all = (await list(central)).map((r) => r.id);
    expect(all).toEqual(expect.arrayContaining([mine.id, theirs.id]));
    await expect(list(student)).rejects.toThrow(/not_authorized/);
  });

  it("passes at 50% exactly and fails below it", async () => {
    const test = await create({ questions: [q(1), q(2), q(3), q(4)] });
    const ids = await questionIds(test.id);
    for (const right of [2, 1]) {
      const attempt = await start(test.hash);
      await submit(
        attempt.id,
        attempt.access,
        ids.map((id, i) => ({ question_id: id, user_answer: i < right ? "A" : "B" })),
      );
    }
    const rows = await call<{
      id: string;
      participant_count: number;
      pass_count: number;
      average_score: string;
    }>(`SELECT * FROM public.list_live_tests($1)`, [owner]);
    const row = rows.find((r) => r.id === test.id);
    expect(row).toMatchObject({ participant_count: 2, pass_count: 1 });
    expect(Number(row?.average_score)).toBe(37.5);
  });

  it("closes unsubmitted attempts of an expired test when the list is read, so they count", async () => {
    const test = await create({ minutes: 10 });
    const attempt = await start(test.hash);
    const ids = await questionIds(test.id);
    await call(`SELECT public.save_shared_answer($1, $2, $3, 'A', false)`, [
      attempt.id,
      attempt.access,
      ids[0],
    ]);
    await db.admin(
      `UPDATE public.custom_test_attempts SET started_at = now() - interval '20 minutes' WHERE id = $1`,
      [attempt.id],
    );
    const rows = await call<{ id: string; participant_count: number }>(
      `SELECT * FROM public.list_live_tests($1)`,
      [owner],
    );
    expect(rows.find((r) => r.id === test.id)?.participant_count).toBe(1);
  });

  it("returns ranked attempts only after the window closes, best first, and only to a manager", async () => {
    const test = await create();
    for (const right of [3, 5, 1]) {
      const attempt = await start(test.hash, `p${right}@example.com`);
      const ids = await questionIds(test.id);
      await submit(
        attempt.id,
        attempt.access,
        ids.map((id, i) => ({ question_id: id, user_answer: i < right ? "A" : "B" })),
      );
    }
    const ranked = (actor: string) =>
      call<{ email: string; score_pct: string }>(
        `SELECT * FROM public.list_test_attempts($1, ARRAY[$2]::uuid[])`,
        [actor, test.id],
      );
    expect(await ranked(owner)).toEqual([]);
    await db.admin(
      `UPDATE public.custom_tests SET starts_at = now() - interval '2 days', expires_at = now() - interval '1 day' WHERE id = $1`,
      [test.id],
    );
    expect((await ranked(owner)).map((r) => r.email)).toEqual([
      "p5@example.com",
      "p3@example.com",
      "p1@example.com",
    ]);
    expect(await ranked(other)).toEqual([]);
    expect(await ranked(central)).toHaveLength(3);
    await expect(ranked(student)).rejects.toThrow(/not_authorized/);
  });
});

describe("import_live_test_questions", () => {
  const importTest = (actor: string, test: string, topic = "Imported topic", exam = "RN") =>
    call<{ r: { added: number; skipped: number } }>(
      `SELECT public.import_live_test_questions($1, $2, $3, $4) AS r`,
      [actor, test, exam, topic],
    ).then((rows) => rows[0].r);

  it("copies uploaded questions into the chosen exam type and subcategory once, and audits it", async () => {
    const test = await create({ title: "To import" });
    expect(await importTest(owner, test.id, "Imported topic", "RM")).toEqual({
      added: 5,
      skipped: 0,
    });
    expect(await importTest(owner, test.id)).toEqual({ added: 0, skipped: 0 });
    const bank = await db.admin<{ exam_type: string; created_by: string }>(
      `SELECT exam_type, created_by FROM public.questions WHERE topic = 'Imported topic'`,
    );
    expect(bank).toHaveLength(5);
    expect(bank.every((r) => r.exam_type === "RM" && r.created_by === owner)).toBe(true);
    const entries = await db.admin<{ details: { added: number; topic: string } }>(
      `SELECT details FROM public.admin_audit_log WHERE target_id = $1 AND action = 'question.import' ORDER BY id`,
      [test.id],
    );
    expect(entries.map((e) => e.details.added)).toEqual([5, 0]);
  });

  it("skips questions the bank already holds (ignoring case and spacing) and repeats inside the test", async () => {
    await db.admin(
      `INSERT INTO public.questions (exam_type, topic, question_text, option_a, option_b, option_c, option_d, correct_answer) VALUES ('RN', 'Existing', '  duplicate QUESTION? ', 'a', 'b', 'c', 'd', 'A')`,
    );
    const test = await create({
      questions: [
        { ...q(1), question_text: "Duplicate question?" },
        { ...q(2), question_text: "Fresh one?" },
        { ...q(3), question_text: "fresh ONE?" },
      ],
    });
    expect(await importTest(owner, test.id, "Deduped")).toEqual({ added: 1, skipped: 2 });
  });

  it("never copies bank-sourced questions back into the bank", async () => {
    await addQuestion(db, { topic: "Source pool" });
    const test = await create({
      mode: "existing",
      allocations: [{ topic: "Source pool", count: 1 }],
    });
    expect(await importTest(owner, test.id, "Nope")).toEqual({ added: 0, skipped: 0 });
  });

  it("is for the owner or the central admin; the topic is required", async () => {
    const test = await create({ questions: [{ ...q(1), question_text: "Owner only?" }] });
    await expect(importTest(other, test.id)).rejects.toThrow(/test_not_found/);
    await expect(importTest(owner, test.id, "  ")).rejects.toThrow(/invalid_topic/);
    expect((await importTest(central, test.id, "By central")).added).toBe(1);
  });
});

describe("access", () => {
  it("is closed to browsers: no function call, and no direct write or key read on the test tables, even for an admin", async () => {
    const [{ id: test }] = [await create()];
    const calls = [
      `SELECT public.create_live_test($1, 't', null, 'RN', 'upload', 30, now(), now() + interval '1 day', 'h', 't', '[]'::jsonb, '[]'::jsonb)`,
      `SELECT public.submit_shared_attempt($1, 'h', '[]'::jsonb)`,
      `SELECT public.save_shared_answer($1, 'h', $1, 'A', false)`,
      `SELECT public.get_shared_attempt($1, 'h')`,
      `SELECT public.get_shared_test_state('h')`,
      `SELECT public.start_shared_attempt('h', 'a@b.c', 'k')`,
      `SELECT public.import_live_test_questions($1, $1, 'RN', 'x')`,
      `SELECT public.republish_live_test($1, $1, 'h', 't', now(), now(), 30)`,
      `SELECT * FROM public.list_live_tests($1)`,
      `SELECT * FROM public.list_test_attempts($1, '{}')`,
    ];
    for (const sql of calls) {
      const params = sql.includes("$1") ? [owner] : [];
      await expect(db.as("authenticated", owner, sql, params)).rejects.toThrow(
        /permission denied/i,
      );
      await expect(db.as("anon", null, sql, params)).rejects.toThrow(/permission denied/i);
    }
    for (const write of [
      `INSERT INTO public.custom_tests (owner_id, title, exam_type, duration_minutes, expires_at, token_hash) VALUES ($1, 't', 'RN', 30, now(), 'z')`,
      `UPDATE public.custom_test_questions SET correct_answer = 'B'`,
      `DELETE FROM public.custom_tests`,
    ]) {
      await expect(
        db.as("authenticated", owner, write, [owner].slice(0, write.includes("$1") ? 1 : 0)),
      ).rejects.toThrow(/permission denied/i);
    }
    await expect(
      db.as("authenticated", owner, `SELECT share_token FROM public.custom_tests WHERE id = $1`, [
        test,
      ]),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      db.as("authenticated", owner, `SELECT correct_answer FROM public.custom_test_questions`),
    ).resolves.toBeDefined();
  });
});
