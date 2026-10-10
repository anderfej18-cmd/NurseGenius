import { describe, expect, it } from "vitest";
import {
  adminCreateQuestionSchema,
  adminCreateSubtopicSchema,
  adminImportQuestionsSchema,
  adminListQuestionsSchema,
  adminListSubtopicsSchema,
  adminRenameSubtopicSchema,
  adminUpdateQuestionSchema,
  listQuestionsSchema,
  questionIdSchema,
  subtopicIdSchema,
  topicCountsSchema,
} from "./questions.schemas";

describe("listQuestionsSchema", () => {
  it("accepts a combined filter", () => {
    const filter = {
      examType: "RN",
      topics: ["Pharmacology"],
      yearFrom: 2018,
      yearTo: 2025,
      difficulty: ["medium"],
      limit: 20,
      cursor: "123e4567-e89b-42d3-a456-426614174000",
    };
    expect(listQuestionsSchema.safeParse(filter).success).toBe(true);
  });

  it.each([
    [{ examType: "RN", difficulty: ["impossible"] }],
    [{ examType: "RN", yearFrom: 1800 }],
    [{ examType: "RN", topics: [""] }],
    [{ examType: "RN", topics: Array.from({ length: 51 }, (_, i) => `t${i}`) }],
    [{ examType: "RN", limit: 0 }],
    [{ examType: "RN", cursor: "'; DROP TABLE questions;--" }],
    [{ examType: "RN", subtopicIds: ["nope"] }],
    [{}],
  ])("rejects %j", (payload) => {
    expect(listQuestionsSchema.safeParse(payload).success).toBe(false);
  });

  it("does not let a student request retired questions or ask for the answer key", () => {
    expect(listQuestionsSchema.safeParse({ examType: "RN", status: "retired" }).success).toBe(
      false,
    );
    expect(listQuestionsSchema.safeParse({ examType: "RN", includeAnswers: true }).success).toBe(
      false,
    );
  });
});

describe("adminListQuestionsSchema", () => {
  it("accepts a status filter and large pages", () => {
    expect(
      adminListQuestionsSchema.safeParse({ examType: "RM", status: "all", limit: 500 }).success,
    ).toBe(true);
    expect(adminListQuestionsSchema.safeParse({ examType: "RM", limit: 501 }).success).toBe(false);
  });
});

describe("topicCountsSchema", () => {
  it("requires a valid exam type", () => {
    expect(topicCountsSchema.safeParse({ examType: "RN" }).success).toBe(true);
    expect(topicCountsSchema.safeParse({ examType: "xx" }).success).toBe(false);
  });
});

describe("admin content schemas", () => {
  const ID = "123e4567-e89b-42d3-a456-426614174000";
  const content = {
    question_text: "Which drug reverses opioid overdose?",
    option_a: "Naloxone",
    option_b: "Atropine",
    option_c: "Heparin",
    option_d: "Insulin",
    correct_answer: "A",
  };

  it("accepts a question, and defaults the rationale to none", () => {
    const parsed = adminCreateQuestionSchema.parse({
      examType: "RN",
      topic: " Pharmacology ",
      content,
    });
    expect(parsed.topic).toBe("Pharmacology");
    expect(parsed.content.rationale).toBeNull();
  });

  it("lets an incomplete question through, for the service to name what is missing", () => {
    expect(
      adminCreateQuestionSchema.safeParse({
        examType: "RN",
        topic: "T",
        content: { ...content, option_c: "" },
      }).success,
    ).toBe(true);
  });

  it.each([
    [{ examType: "RN", topic: "T", content: { ...content, created_by: "someone-else" } }],
    [{ examType: "RN", topic: "T", content: { ...content, status: "retired" } }],
    [{ examType: "RN", topic: "T", content, createdBy: "someone-else" }],
    [{ examType: "RN", topic: "  ", content }],
    [{ examType: "XX", topic: "T", content }],
    [{ examType: "RN", topic: "T", content: { ...content, question_text: "x".repeat(5001) } }],
    [{ examType: "RN", topic: "T" }],
  ])("rejects the question %j", (payload) => {
    expect(adminCreateQuestionSchema.safeParse(payload).success).toBe(false);
  });

  it("accepts an import of 1 to 500 questions and rejects 0 or 501", () => {
    const of = (n: number) => ({
      examType: "RM",
      topic: "T",
      questions: Array.from({ length: n }, () => content),
    });
    expect(adminImportQuestionsSchema.safeParse(of(1)).success).toBe(true);
    expect(adminImportQuestionsSchema.safeParse(of(500)).success).toBe(true);
    expect(adminImportQuestionsSchema.safeParse(of(0)).success).toBe(false);
    expect(adminImportQuestionsSchema.safeParse(of(501)).success).toBe(false);
  });

  it("accepts partial updates, including clearing the difficulty, source and subtopic", () => {
    for (const change of [
      { difficulty: "hard" },
      { difficulty: null, source: null, subtopicId: null },
      { tags: ["drugs"] },
      { content },
    ]) {
      expect(adminUpdateQuestionSchema.safeParse({ questionId: ID, ...change }).success).toBe(true);
    }
  });

  it.each([
    [{ questionId: "nope", difficulty: "easy" }],
    [{ questionId: ID, difficulty: "impossible" }],
    [{ questionId: ID, tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }],
    [{ questionId: ID, tags: ["x".repeat(41)] }],
    [{ questionId: ID, tags: [""] }],
    [{ questionId: ID, source: "x".repeat(201) }],
    [{ questionId: ID, subtopicId: "nope" }],
    [{ questionId: ID, status: "retired" }],
    [{ questionId: ID, exam_type: "RM" }],
  ])("rejects the update %j", (payload) => {
    expect(adminUpdateQuestionSchema.safeParse(payload).success).toBe(false);
  });

  it("takes only a question id to retire or restore, and only an id to delete a subtopic", () => {
    expect(questionIdSchema.safeParse({ questionId: ID }).success).toBe(true);
    expect(questionIdSchema.safeParse({ questionId: ID, status: "active" }).success).toBe(false);
    expect(subtopicIdSchema.safeParse({ subtopicId: ID }).success).toBe(true);
    expect(subtopicIdSchema.safeParse({ subtopicId: "nope" }).success).toBe(false);
  });

  it("accepts subtopic requests and rejects forged fields", () => {
    expect(adminListSubtopicsSchema.safeParse({ examType: "RN" }).success).toBe(true);
    expect(
      adminCreateSubtopicSchema.safeParse({ examType: "RN", topic: "T", name: "Opioids" }).success,
    ).toBe(true);
    expect(
      adminCreateSubtopicSchema.safeParse({ examType: "RN", topic: "T", name: "N", id: ID })
        .success,
    ).toBe(false);
    expect(adminRenameSubtopicSchema.safeParse({ subtopicId: ID, name: "New" }).success).toBe(true);
    expect(adminRenameSubtopicSchema.safeParse({ subtopicId: ID }).success).toBe(false);
  });
});
