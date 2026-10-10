import { describe, expect, it } from "vitest";
import { HISTORY_MAX } from "@/lib/exam-rules";
import {
  examIdSchema,
  historySchema,
  saveAnswerSchema,
  startSessionSchema,
} from "./sessions.schemas";

const uuid = "123e4567-e89b-42d3-a456-426614174000";

describe("startSessionSchema", () => {
  const valid = { examType: "RN", category: "All Areas", count: 20, minutes: 30 };

  it("accepts a normal request", () => {
    expect(startSessionSchema.parse(valid)).toEqual(valid);
  });

  it.each([
    [{ ...valid, examType: "MD" }],
    [{ ...valid, count: 0 }],
    [{ ...valid, count: 251 }],
    [{ ...valid, count: 10.5 }],
    [{ ...valid, minutes: 4 }],
    [{ ...valid, minutes: 181 }],
    [{ ...valid, category: "   " }],
    [{ ...valid, category: "x".repeat(201) }],
    [{ ...valid, count: "20" }],
  ])("rejects %j", (payload) => {
    expect(startSessionSchema.safeParse(payload).success).toBe(false);
  });

  it("accepts a selection mode, and nothing else in its place", () => {
    expect(startSessionSchema.safeParse({ ...valid, selection: "adaptive" }).success).toBe(true);
    expect(startSessionSchema.safeParse({ ...valid, selection: "random" }).success).toBe(true);
    expect(startSessionSchema.safeParse({ ...valid, selection: "hardest" }).success).toBe(false);
    expect(startSessionSchema.safeParse({ ...valid, selection: ["q1", "q2"] }).success).toBe(false);
  });

  it("rejects a client-chosen question list, score or tier", () => {
    for (const extra of [
      { questionIds: [uuid] },
      { score_pct: 100 },
      { tier: "scholar" },
      { userId: uuid },
    ]) {
      expect(startSessionSchema.safeParse({ ...valid, ...extra }).success).toBe(false);
    }
  });
});

describe("saveAnswerSchema", () => {
  const valid = {
    examId: uuid,
    questionId: uuid,
    answer: "B",
    confidence: "high",
    flagged: true,
    timeSpentMs: 4200,
  };

  it("accepts a full and a partial payload", () => {
    expect(saveAnswerSchema.safeParse(valid).success).toBe(true);
    expect(
      saveAnswerSchema.safeParse({ examId: uuid, questionId: uuid, flagged: false }).success,
    ).toBe(true);
  });

  it("accepts a hint report that is exactly 'a hint was shown', and nothing else", () => {
    expect(
      saveAnswerSchema.safeParse({ examId: uuid, questionId: uuid, hintUsed: true }).success,
    ).toBe(true);
    for (const forged of [
      { hintUsed: false },
      { hintUsed: 3 },
      { hintsUsed: 0 },
      { hints_used: 0 },
    ]) {
      expect(
        saveAnswerSchema.safeParse({ examId: uuid, questionId: uuid, ...forged }).success,
      ).toBe(false);
    }
  });

  it.each([
    "is_correct",
    "isCorrect",
    "score",
    "score_pct",
    "correct_count",
    "status",
    "user_id",
    "correct_answer",
  ])("rejects the forged field %s", (field) => {
    expect(saveAnswerSchema.safeParse({ ...valid, [field]: true }).success).toBe(false);
  });

  it.each([
    [{ ...valid, answer: "E" }],
    [{ ...valid, answer: "a" }],
    [{ ...valid, confidence: "certain" }],
    [{ ...valid, examId: "not-a-uuid" }],
    [{ ...valid, questionId: "1 OR 1=1" }],
    [{ ...valid, timeSpentMs: -1 }],
    [{ ...valid, timeSpentMs: 3_600_001 }],
    [{ ...valid, timeSpentMs: 1.5 }],
  ])("rejects %j", (payload) => {
    expect(saveAnswerSchema.safeParse(payload).success).toBe(false);
  });
});

describe("examIdSchema", () => {
  it("accepts a uuid only", () => {
    expect(examIdSchema.safeParse({ examId: uuid }).success).toBe(true);
    expect(examIdSchema.safeParse({ examId: "abc" }).success).toBe(false);
    expect(examIdSchema.safeParse({ examId: uuid, userId: uuid }).success).toBe(false);
  });
});

describe("startSessionSchema: practising similar questions", () => {
  const valid = { examType: "RN", category: "Pharmacology", count: 10, minutes: 30 };

  it("needs the question to be similar to, and accepts it only for the similar mode", () => {
    expect(
      startSessionSchema.safeParse({ ...valid, selection: "similar", similarTo: uuid }).success,
    ).toBe(true);
    expect(startSessionSchema.safeParse({ ...valid, selection: "similar" }).success).toBe(false);
    expect(startSessionSchema.safeParse({ ...valid, similarTo: uuid }).success).toBe(false);
    expect(
      startSessionSchema.safeParse({ ...valid, selection: "adaptive", similarTo: uuid }).success,
    ).toBe(false);
  });

  it("rejects a similarTo that is not a question id", () => {
    expect(
      startSessionSchema.safeParse({ ...valid, selection: "similar", similarTo: "q-1" }).success,
    ).toBe(false);
  });
});

describe("historySchema", () => {
  it("takes nothing, or a limit within bounds", () => {
    expect(historySchema.safeParse({}).success).toBe(true);
    expect(historySchema.safeParse({ limit: 10 }).success).toBe(true);
    expect(historySchema.safeParse({ limit: HISTORY_MAX }).success).toBe(true);
  });

  it("rejects a limit out of range, a fraction, and any other field (such as a user id)", () => {
    for (const bad of [{ limit: 0 }, { limit: HISTORY_MAX + 1 }, { limit: 2.5 }, { limit: "5" }]) {
      expect(historySchema.safeParse(bad).success).toBe(false);
    }
    expect(historySchema.safeParse({ userId: "someone-else" }).success).toBe(false);
  });
});
