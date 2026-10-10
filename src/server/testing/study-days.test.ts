import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addQuestion, moveSessionTo, runSession, serviceCall } from "./fixtures";
import { createTestDb, type TestDb } from "./pglite-db";

let db: TestDb;
let alice: string;
let bob: string;
let questions: string[];

const studyDays = (userId: string, since: string | null = null) =>
  serviceCall<{ study_day: string; answered: number }>(
    db,
    `SELECT to_char(study_day, 'YYYY-MM-DD') AS study_day, answered FROM public.get_study_days($1, $2::date)`,
    [userId, since],
  );

beforeAll(async () => {
  db = await createTestDb();
  alice = await db.createUser("alice-days@example.com");
  bob = await db.createUser("bob-days@example.com");
  questions = await Promise.all(Array.from({ length: 6 }, () => addQuestion(db)));
});
afterAll(() => db.pg.close());

describe("get_study_days", () => {
  it("counts answered questions per UTC day, oldest day first", async () => {
    const first = await runSession(db, alice, [
      [questions[0], "A"],
      [questions[1], "B"],
      [questions[2], null],
    ]);
    await moveSessionTo(db, first, "2026-10-01T23:30:00Z");
    const second = await runSession(db, alice, [[questions[3], "A"]]);
    await moveSessionTo(db, second, "2026-10-02T00:30:00Z");

    expect(await studyDays(alice)).toEqual([
      { study_day: "2026-10-01", answered: 2 },
      { study_day: "2026-10-02", answered: 1 },
    ]);
  });

  it("leaves out sessions that are not finished", async () => {
    await runSession(db, bob, [[questions[0], "A"]], { submit: false });
    expect(await studyDays(bob)).toEqual([]);
  });

  it("returns only the requested student's days", async () => {
    const carol = await db.createUser("carol-days@example.com");
    expect(await studyDays(carol)).toEqual([]);
  });

  it("starts from the given date", async () => {
    expect((await studyDays(alice, "2026-10-02")).map((d) => d.study_day)).toEqual(["2026-10-02"]);
  });

  it("is not callable by students", async () => {
    await expect(
      db.as("authenticated", alice, `SELECT * FROM public.get_study_days($1, null)`, [alice]),
    ).rejects.toThrow(/permission denied/i);
  });
});
