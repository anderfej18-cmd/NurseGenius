import { describe, expect, it } from "vitest";
import {
  claimAttemptSchema,
  createCustomTestSchema,
  getAttemptSchema,
  getSharedTestSchema,
  importCustomTestQuestionsSchema,
  republishCustomTestSchema,
  saveAnswerSchema,
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

describe("resume and save (public)", () => {
  it("accepts an attempt id with its key, and one answer with its flag", () => {
    expect(getAttemptSchema.safeParse({ attemptId: ID, accessKey: KEY }).success).toBe(true);
    for (const answer of ["A", null]) {
      expect(
        saveAnswerSchema.safeParse({
          attemptId: ID,
          accessKey: KEY,
          questionId: ID,
          answer,
          flagged: true,
        }).success,
      ).toBe(true);
    }
  });

  it.each([
    [getAttemptSchema, { attemptId: "nope", accessKey: KEY }],
    [getAttemptSchema, { attemptId: ID }],
    [
      saveAnswerSchema,
      { attemptId: ID, accessKey: KEY, questionId: ID, answer: "AB", flagged: false },
    ],
    [saveAnswerSchema, { attemptId: ID, accessKey: KEY, questionId: ID, answer: "A" }],
    [
      saveAnswerSchema,
      { attemptId: ID, accessKey: KEY, questionId: "nope", answer: "A", flagged: false },
    ],
    [
      saveAnswerSchema,
      { attemptId: ID, accessKey: KEY, questionId: ID, answer: "A", flagged: "yes" },
    ],
    [
      saveAnswerSchema,
      {
        attemptId: ID,
        accessKey: KEY,
        questionId: ID,
        answer: "A",
        flagged: false,
        is_correct: true,
      },
    ],
  ])("rejects %#", (schema, payload) => {
    expect(schema.safeParse(payload).success).toBe(false);
  });
});

describe("admin live-test functions", () => {
  const question = {
    question_text: "Q?",
    option_a: "a",
    option_b: "b",
    option_c: "c",
    option_d: "d",
    correct_answer: "A",
    rationale: null,
  };
  const schedule = {
    startsAt: "2026-12-01T09:00:00.000Z",
    expiresAt: "2026-12-02T09:00:00.000Z",
    durationMinutes: 30,
  };
  const upload = {
    title: "Mock",
    description: "",
    examType: "RN",
    sourceMode: "upload",
    ...schedule,
    questions: [question],
  };
  const bank = {
    title: "Mock",
    description: "",
    examType: "RM",
    sourceMode: "existing",
    ...schedule,
    allocations: [
      { topic: "Antenatal care", count: 10 },
      { topic: "Postnatal care", count: 5 },
    ],
  };

  it("accepts an upload test and a bank test with per-subcategory counts", () => {
    expect(createCustomTestSchema.safeParse(upload).success).toBe(true);
    expect(createCustomTestSchema.safeParse(bank).success).toBe(true);
  });

  it.each([
    [{ ...upload, examType: "XX" }],
    [{ ...upload, sourceMode: "paste" }],
    [{ ...upload, durationMinutes: "30" }],
    [{ ...upload, startsAt: undefined }],
    [{ ...upload, title: "x".repeat(201) }],
    [{ ...upload, questions: Array(251).fill(question) }],
    [{ ...upload, questions: [{ ...question, question_text: 5 }] }],
    [{ ...upload, questions: [{ ...question, source_kind: "existing" }] }],
    [{ ...upload, tokenHash: HASH }],
    [{ ...upload, owner_id: "someone-else" }],
    [{ ...upload, allocations: [{ topic: "A", count: 1 }] }],
    [{ ...bank, questions: [question] }],
    [{ ...bank, allocations: [{ topic: "", count: 1 }] }],
    [{ ...bank, allocations: [{ topic: "A", count: 0 }] }],
    [{ ...bank, allocations: [{ topic: "A", count: 251 }] }],
    [{ ...bank, allocations: [{ topic: "A", count: 1.5 }] }],
  ])("rejects the test %#", (payload) => {
    expect(createCustomTestSchema.safeParse(payload).success).toBe(false);
  });

  it("validates republish with a new schedule, and import with an exam type and subcategory", () => {
    expect(republishCustomTestSchema.safeParse({ testId: ID, ...schedule }).success).toBe(true);
    expect(republishCustomTestSchema.safeParse({ testId: "nope", ...schedule }).success).toBe(
      false,
    );
    expect(
      republishCustomTestSchema.safeParse({ testId: ID, ...schedule, tokenHash: HASH }).success,
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
