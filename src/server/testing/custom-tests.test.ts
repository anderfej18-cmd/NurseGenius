import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serviceCall } from "./fixtures";
import { createTestDb, type TestDb } from "./pglite-db";

let db: TestDb;
let owner: string;
let other: string;

const HASH = "a".repeat(64);
const q = (n: number, correct = "A") => ({
  question_text: `Q${n}?`,
  option_a: "a",
  option_b: "b",
  option_c: "c",
  option_d: "d",
  correct_answer: correct,
  rationale: n === 1 ? "Because." : null,
  source_question_id: null,
  source_kind: "custom",
});

const create = (hash = HASH, questions = [q(1), q(2), q(3), q(4), q(5)], by = owner) =>
  serviceCall<{ id: string }>(
    db,
    `SELECT public.create_custom_test($1, 'Mock', 'desc', 'RN', 'upload', 30, now() + interval '1 day', $2, $3::jsonb) AS id`,
    [by, hash, JSON.stringify(questions)],
  ).then((rows) => rows[0].id);

const start = async (testId: string, hash = "h".repeat(64)) =>
  (
    await db.admin<{ id: string }>(
      `INSERT INTO public.custom_test_attempts (custom_test_id, email, access_hash, total_questions)
       SELECT $1, 'taker@example.com', $2, count(*) FROM public.custom_test_questions WHERE custom_test_id = $1 RETURNING id`,
      [testId, hash],
    )
  )[0].id;

const questionIds = async (testId: string) =>
  (
    await db.admin<{ id: string }>(
      `SELECT id FROM public.custom_test_questions WHERE custom_test_id = $1 ORDER BY position`,
      [testId],
    )
  ).map((row) => row.id);

const submit = (attempt: string, hash: string, answers: unknown) =>
  serviceCall<{
    r: { score: number; correct: number; total: number; results: Array<{ is_correct: boolean }> };
  }>(db, `SELECT public.submit_shared_attempt($1, $2, $3::jsonb) AS r`, [
    attempt,
    hash,
    JSON.stringify(answers),
  ]).then((rows) => rows[0].r);

beforeAll(async () => {
  db = await createTestDb();
  [owner, other] = await Promise.all(
    ["own", "oth"].map((n) => db.createUser(`${n}-ct@example.com`)),
  );
});
afterAll(() => db.pg.close());

describe("create_custom_test", () => {
  it("stores the test and every question in one step, in order, as published", async () => {
    const id = await create("1".repeat(64));
    const [test] = await db.admin<{ status: string; owner_id: string }>(
      `SELECT status, owner_id FROM public.custom_tests WHERE id = $1`,
      [id],
    );
    expect(test).toEqual({ status: "published", owner_id: owner });
    const rows = await db.admin<{ position: number; question_text: string }>(
      `SELECT position, question_text FROM public.custom_test_questions WHERE custom_test_id = $1 ORDER BY position`,
      [id],
    );
    expect(rows.map((r) => [r.position, r.question_text])).toEqual([
      [0, "Q1?"],
      [1, "Q2?"],
      [2, "Q3?"],
      [3, "Q4?"],
      [4, "Q5?"],
    ]);
  });

  it("leaves nothing behind when a question is invalid", async () => {
    const before = (await db.admin(`SELECT 1 FROM public.custom_tests`)).length;
    await expect(create("2".repeat(64), [q(1), q(2, "Z")])).rejects.toThrow();
    expect((await db.admin(`SELECT 1 FROM public.custom_tests`)).length).toBe(before);
  });
});

describe("submit_shared_attempt", () => {
  it("scores from the stored key, records every answer, and closes the attempt, all at once", async () => {
    const test = await create("3".repeat(64));
    const attempt = await start(test, "s1".padEnd(64, "x"));
    const ids = await questionIds(test);
    const result = await submit(attempt, "s1".padEnd(64, "x"), [
      { question_id: ids[0], user_answer: "A" },
      { question_id: ids[1], user_answer: "B" },
      { question_id: ids[2], user_answer: "A" },
      { question_id: ids[3], user_answer: "a" },
      { question_id: ids[4], user_answer: null },
    ]);
    expect(result).toMatchObject({ correct: 3, total: 5, score: 60 });
    expect(result.results.map((r) => r.is_correct)).toEqual([true, false, true, true, false]);
    const [row] = await db.admin<{ status: string; score_pct: string }>(
      `SELECT status, score_pct FROM public.custom_test_attempts WHERE id = $1`,
      [attempt],
    );
    expect(row.status).toBe("completed");
  });

  it("cannot be forged: a client-claimed score or correctness is not an input at all", async () => {
    const test = await create("4".repeat(64));
    const attempt = await start(test, "s2".padEnd(64, "x"));
    const ids = await questionIds(test);
    const result = await submit(
      attempt,
      "s2".padEnd(64, "x"),
      ids.map((id) => ({ question_id: id, user_answer: "D", is_correct: true, score: 100 })),
    );
    expect(result.correct).toBe(0);
  });

  it("refuses a second submission without changing the stored result", async () => {
    const test = await create("5".repeat(64));
    const hash = "s3".padEnd(64, "x");
    const attempt = await start(test, hash);
    const ids = await questionIds(test);
    const all = ids.map((id) => ({ question_id: id, user_answer: "A" }));
    await submit(attempt, hash, all);
    await expect(
      submit(
        attempt,
        hash,
        ids.map((id) => ({ question_id: id, user_answer: "B" })),
      ),
    ).rejects.toThrow(/attempt_closed/);
    const [row] = await db.admin<{ correct_count: number }>(
      `SELECT correct_count FROM public.custom_test_attempts WHERE id = $1`,
      [attempt],
    );
    expect(row.correct_count).toBe(5);
  });

  it("needs 80% answered before the time is up, but accepts anything after the deadline", async () => {
    const test = await create("6".repeat(64));
    const hash = "s4".padEnd(64, "x");
    const attempt = await start(test, hash);
    const ids = await questionIds(test);
    await expect(
      submit(attempt, hash, [{ question_id: ids[0], user_answer: "A" }]),
    ).rejects.toThrow(/too_few_answered:4/);
    await db.admin(
      `UPDATE public.custom_test_attempts SET started_at = now() - interval '2 hours' WHERE id = $1`,
      [attempt],
    );
    expect((await submit(attempt, hash, [{ question_id: ids[0], user_answer: "A" }])).correct).toBe(
      1,
    );
  });

  it("refuses a wrong key, an unknown attempt, a question from another test, and a duplicated question", async () => {
    const test = await create("7".repeat(64));
    const foreign = await create("8".repeat(64));
    const hash = "s5".padEnd(64, "x");
    const attempt = await start(test, hash);
    const ids = await questionIds(test);
    const full = ids.map((id) => ({ question_id: id, user_answer: "A" }));
    await expect(submit(attempt, "wrong".padEnd(64, "x"), full)).rejects.toThrow(
      /attempt_not_found/,
    );
    await expect(submit("00000000-0000-4000-8000-000000000001", hash, full)).rejects.toThrow(
      /attempt_not_found/,
    );
    const [stranger] = await questionIds(foreign);
    await expect(
      submit(attempt, hash, [...full.slice(0, 4), { question_id: stranger, user_answer: "A" }]),
    ).rejects.toThrow(/answers_not_in_test/);
    await expect(submit(attempt, hash, [...full, full[0]])).rejects.toThrow(/answers_not_in_test/);
  });
});

describe("import_custom_test_to_bank", () => {
  it("copies each question once into the bank for the owner, and marks them", async () => {
    const test = await create("9".repeat(64));
    const call = () =>
      serviceCall<{ n: number }>(
        db,
        `SELECT public.import_custom_test_to_bank($1, $2, 'Imported topic') AS n`,
        [owner, test],
      ).then((r) => r[0].n);
    expect(await call()).toBe(5);
    expect(await call()).toBe(0);
    const bank = await db.admin(
      `SELECT 1 FROM public.questions WHERE topic = 'Imported topic' AND created_by = $1`,
      [owner],
    );
    expect(bank).toHaveLength(5);
  });

  it("is not available for a test the caller does not own", async () => {
    const test = await create("b".repeat(64));
    await expect(
      serviceCall(db, `SELECT public.import_custom_test_to_bank($1, $2, 'X')`, [other, test]),
    ).rejects.toThrow(/test_not_found/);
  });
});

describe("list_custom_test_summaries", () => {
  it("counts questions and finished attempts per test, for the owner only", async () => {
    const mine = await create("c".repeat(64));
    const hash = "s6".padEnd(64, "x");
    const attempt = await start(mine, hash);
    const ids = await questionIds(mine);
    await submit(
      attempt,
      hash,
      ids.map((id) => ({ question_id: id, user_answer: "A" })),
    );
    const rows = await serviceCall<{
      id: string;
      question_count: number;
      participant_count: number;
      pass_count: number;
      average_score: string;
    }>(db, `SELECT * FROM public.list_custom_test_summaries($1)`, [owner]);
    const row = rows.find((r) => r.id === mine);
    expect(row).toMatchObject({ question_count: 5, participant_count: 1, pass_count: 1 });
    expect(Number(row?.average_score)).toBe(100);
    expect(
      await serviceCall(db, `SELECT * FROM public.list_custom_test_summaries($1)`, [other]),
    ).toEqual([]);
  });
});

describe("access", () => {
  it("is closed to browsers: no function call, and no direct write to the test tables, even for an admin", async () => {
    await db.admin(`INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'admin')`, [owner]);
    for (const call of [
      `SELECT public.create_custom_test($1, 't', null, 'RN', 'upload', 30, now(), 'h', '[]'::jsonb)`,
      `SELECT public.submit_shared_attempt($1, 'h', '[]'::jsonb)`,
      `SELECT public.import_custom_test_to_bank($1, $1, 'x')`,
      `SELECT * FROM public.list_custom_test_summaries($1)`,
    ]) {
      await expect(db.as("authenticated", owner, call, [owner])).rejects.toThrow(
        /permission denied/i,
      );
      await expect(db.as("anon", null, call, [owner])).rejects.toThrow(/permission denied/i);
    }
    for (const write of [
      `INSERT INTO public.custom_tests (owner_id, title, exam_type, duration_minutes, expires_at, token_hash) VALUES ($1, 't', 'RN', 30, now(), 'z')`,
      `UPDATE public.custom_test_questions SET correct_answer = 'B'`,
      `DELETE FROM public.custom_tests`,
    ]) {
      await expect(
        db.as("authenticated", owner, write, write.includes("$1") ? [owner] : []),
      ).rejects.toThrow(/permission denied/i);
    }
  });
});
