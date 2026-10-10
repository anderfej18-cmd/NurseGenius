import { describe, expect, it } from "vitest";
import {
  claimAttemptSchema,
  createCustomTestSchema,
  getSharedTestSchema,
  importCustomTestQuestionsSchema,
  republishCustomTestSchema,
  startSharedTestSchema,
  submitSharedTestSchema,
} from "./custom-tests.schemas";

const ID = "6f1c2f6e-0a53-4a54-9d3b-6a6f2b7a0c11";
const HASH = "a".repeat(64);
const KEY = "k".repeat(40);

describe("shared-test links (public, so the schemas are the only gate)", () => {
  it("accepts what the test page sends", () => {
    expect(getSharedTestSchema.safeParse({ tokenHash: HASH }).success).toBe(true);
    expect(
      startSharedTestSchema.safeParse({ tokenHash: HASH, email: "a@b.co", accessKey: KEY }).success,
    ).toBe(true);
    expect(
      submitSharedTestSchema.safeParse({
        attemptId: ID,
        accessKey: KEY,
        answers: [
          { question_id: ID, user_answer: "A" },
          { question_id: "7f1c2f6e-0a53-4a54-9d3b-6a6f2b7a0c11", user_answer: null },
        ],
      }).success,
    ).toBe(true);
    expect(claimAttemptSchema.safeParse({ attemptId: ID, accessKey: KEY }).success).toBe(true);
  });

  it.each([
    [getSharedTestSchema, {}],
    [getSharedTestSchema, { tokenHash: 5 }],
    [getSharedTestSchema, { tokenHash: "x".repeat(129) }],
    [getSharedTestSchema, { tokenHash: HASH, extra: 1 }],
    [startSharedTestSchema, { tokenHash: HASH, email: "a@b.co" }],
    [startSharedTestSchema, { tokenHash: HASH, email: "x".repeat(300), accessKey: KEY }],
    [startSharedTestSchema, { tokenHash: HASH, email: "a@b.co", accessKey: "k".repeat(300) }],
    [startSharedTestSchema, { tokenHash: HASH, email: ["a@b.co"], accessKey: KEY }],
    [submitSharedTestSchema, { attemptId: "nope", accessKey: KEY, answers: [] }],
    [submitSharedTestSchema, { attemptId: ID, accessKey: KEY, answers: "A" }],
    [
      submitSharedTestSchema,
      {
        attemptId: ID,
        accessKey: KEY,
        answers: Array(251).fill({ question_id: ID, user_answer: "A" }),
      },
    ],
    [
      submitSharedTestSchema,
      { attemptId: ID, accessKey: KEY, answers: [{ question_id: ID, user_answer: "AB" }] },
    ],
    [
      submitSharedTestSchema,
      { attemptId: ID, accessKey: KEY, answers: [{ question_id: "nope", user_answer: "A" }] },
    ],
    [
      submitSharedTestSchema,
      {
        attemptId: ID,
        accessKey: KEY,
        answers: [{ question_id: ID, user_answer: "A", is_correct: true }],
      },
    ],
    [claimAttemptSchema, { attemptId: ID }],
  ])("rejects %#", (schema, payload) => {
    expect(schema.safeParse(payload).success).toBe(false);
  });
});

describe("admin custom-test functions", () => {
  const question = {
    question_text: "Q?",
    option_a: "a",
    option_b: "b",
    option_c: "c",
    option_d: "d",
    correct_answer: "A",
    rationale: null,
    source_kind: "custom",
  };
  const test = {
    title: "Mock",
    description: "",
    examType: "RN",
    sourceMode: "upload",
    durationMinutes: 30,
    expiresAt: "2026-12-01T00:00:00.000Z",
    tokenHash: HASH,
    questions: [question],
  };

  it("accepts a test, and a question that came from the bank", () => {
    expect(createCustomTestSchema.safeParse(test).success).toBe(true);
    expect(
      createCustomTestSchema.safeParse({
        ...test,
        questions: [{ ...question, source_kind: "existing", source_question_id: ID }],
      }).success,
    ).toBe(true);
  });

  it.each([
    [{ ...test, examType: "XX" }],
    [{ ...test, sourceMode: "paste" }],
    [{ ...test, durationMinutes: "30" }],
    [{ ...test, title: "x".repeat(201) }],
    [{ ...test, questions: Array(251).fill(question) }],
    [{ ...test, questions: [{ ...question, source_kind: "other" }] }],
    [{ ...test, questions: [{ ...question, question_text: 5 }] }],
    [{ ...test, owner_id: "someone-else" }],
  ])("rejects the test %#", (payload) => {
    expect(createCustomTestSchema.safeParse(payload).success).toBe(false);
  });

  it("validates republish and import", () => {
    expect(
      republishCustomTestSchema.safeParse({ testId: ID, tokenHash: HASH, expiresAt: "2026-12-01" })
        .success,
    ).toBe(true);
    expect(
      republishCustomTestSchema.safeParse({
        testId: "nope",
        tokenHash: HASH,
        expiresAt: "2026-12-01",
      }).success,
    ).toBe(false);
    expect(
      importCustomTestQuestionsSchema.safeParse({
        testId: ID,
        topic: "Pharmacology",
        examType: "RN",
      }).success,
    ).toBe(true);
    expect(
      importCustomTestQuestionsSchema.safeParse({
        testId: ID,
        topic: "x".repeat(201),
        examType: "RN",
      }).success,
    ).toBe(false);
  });
});
