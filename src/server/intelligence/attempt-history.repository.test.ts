import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "../testing/fake-supabase";
import { AttemptHistoryRepository } from "./attempt-history.repository.server";

const USER = "user-1";
const row = (overrides: Record<string, unknown> = {}) => ({
  question_id: "q1",
  topic: "Anatomy",
  exam_type: "RN",
  session_id: "s1",
  session_type: "mixed",
  correct: true,
  answered_at: "2026-10-05T10:00:00.000Z",
  difficulty: "hard",
  confidence: "high",
  time_spent_ms: 4200,
  ...overrides,
});
const sent = (fake: ReturnType<typeof createFakeSupabase>, fn: string) =>
  fake.callsOn(`rpc:${fn}`, "args")[0].args[0];

describe("AttemptHistoryRepository.list", () => {
  it("asks for the signed-in student's attempts only, capped, and maps rows to signals", async () => {
    const fake = createFakeSupabase([{ data: [row()] }]);
    const result = await new AttemptHistoryRepository(fake.client).list(USER, { limit: 300 });

    expect(sent(fake, "get_student_attempts")).toMatchObject({ _user_id: USER, _limit: 300 });
    expect(result).toEqual([
      {
        questionId: "q1",
        topic: "Anatomy",
        examType: "RN",
        sessionId: "s1",
        correct: true,
        answeredAt: new Date("2026-10-05T10:00:00.000Z"),
        difficulty: "hard",
        confidence: "high",
        timeSpentMs: 4200,
        sessionType: "mixed",
      },
    ]);
  });

  it("applies the default cap when none is given and passes the period and question filters through", async () => {
    const fake = createFakeSupabase([{ data: [] }, { data: [] }]);
    const repository = new AttemptHistoryRepository(fake.client);
    await repository.list(USER);
    await repository.list(USER, {
      since: new Date("2026-09-01T00:00:00.000Z"),
      questionIds: ["q9"],
    });
    const calls = fake.callsOn("rpc:get_student_attempts", "args").map((call) => call.args[0]);
    expect(calls[0]).toMatchObject({ _limit: 5000 });
    expect(calls[1]).toMatchObject({ _since: "2026-09-01T00:00:00.000Z", _question_ids: ["q9"] });
  });

  it("keeps a missing difficulty, confidence or time as null", async () => {
    const fake = createFakeSupabase([
      { data: [row({ difficulty: null, confidence: null, time_spent_ms: null })] },
    ]);
    const [signal] = await new AttemptHistoryRepository(fake.client).list(USER);
    expect(signal).toMatchObject({ difficulty: null, confidence: null, timeSpentMs: null });
  });

  it("fails loudly on a row the database should never produce", async () => {
    const fake = createFakeSupabase([{ data: [row({ exam_type: "MD" })] }]);
    await expect(new AttemptHistoryRepository(fake.client).list(USER)).rejects.toThrow();
  });

  it("rethrows database errors for the controller to mask", async () => {
    const error = { message: "boom" };
    const fake = createFakeSupabase([{ error }]);
    await expect(new AttemptHistoryRepository(fake.client).list(USER)).rejects.toBe(error);
  });
});

describe("AttemptHistoryRepository.questionStats", () => {
  it("returns cross-student attempt counts per question", async () => {
    const fake = createFakeSupabase([{ data: [{ question_id: "q1", attempts: 30, correct: 24 }] }]);
    const stats = await new AttemptHistoryRepository(fake.client).questionStats(["q1", "q2"]);
    expect(sent(fake, "get_question_difficulty_stats")).toEqual({ _question_ids: ["q1", "q2"] });
    expect(stats).toEqual(new Map([["q1", { attempts: 30, correct: 24 }]]));
  });

  it("does not call the database for no questions", async () => {
    const fake = createFakeSupabase([]);
    expect(await new AttemptHistoryRepository(fake.client).questionStats([])).toEqual(new Map());
    expect(fake.recorded).toHaveLength(0);
  });
});
