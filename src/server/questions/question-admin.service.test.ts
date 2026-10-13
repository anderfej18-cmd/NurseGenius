import { describe, expect, it, vi } from "vitest";
import { NotFoundError, ValidationError } from "../errors";
import {
  type QuestionAdminStore,
  QuestionAdminService,
  type NewQuestionContent,
} from "./question-admin.service";

const ADMIN = "admin-1";
const SUBTOPIC = "00000000-0000-4000-8000-000000000001";
const QUESTION = "00000000-0000-4000-8000-000000000002";

const content = (overrides: Partial<NewQuestionContent> = {}): NewQuestionContent => ({
  question_text: "Which drug reverses opioid overdose?",
  option_a: "Naloxone",
  option_b: "Atropine",
  option_c: "Heparin",
  option_d: "Insulin",
  correct_answer: "A",
  rationale: null,
  ...overrides,
});

function setup(overrides: Partial<QuestionAdminStore> = {}) {
  const store = {
    insertMany: vi.fn(async (rows: readonly unknown[]) => rows.length),
    update: vi.fn(async (_id: string, _changes: unknown) => true),
    setStatus: vi.fn(async (_id: string, _status: "active" | "retired") => true),
    deleteForever: vi.fn(async (_adminId: string, _id: string) => undefined),
    questionScope: vi.fn(
      async (_id: string): Promise<{ examType: "RN" | "RM"; topic: string } | null> => ({
        examType: "RN",
        topic: "Pharmacology",
      }),
    ),
    subtopicScope: vi.fn(
      async (_id: string): Promise<{ examType: "RN" | "RM"; topic: string } | null> => ({
        examType: "RN",
        topic: "Pharmacology",
      }),
    ),
    listSubtopics: vi.fn(async (_examType: "RN" | "RM", _topic?: string) => []),
    createSubtopic: vi.fn(
      async (input: { examType: "RN" | "RM"; topic: string; name: string }) => ({
        id: SUBTOPIC,
        ...input,
      }),
    ),
    renameSubtopic: vi.fn(async (_id: string, _name: string) => true),
    deleteSubtopic: vi.fn(async (_id: string) => true),
    ...overrides,
  } satisfies QuestionAdminStore;
  return { service: new QuestionAdminService({ store }), store };
}

describe("QuestionAdminService.create", () => {
  it("stores one complete question under the exam type and topic, credited to the admin", async () => {
    const { service, store } = setup();
    expect(
      await service.create(ADMIN, { examType: "RN", topic: " Pharmacology ", content: content() }),
    ).toEqual({ created: 1 });
    expect(store.insertMany).toHaveBeenCalledWith([
      { ...content(), exam_type: "RN", topic: "Pharmacology", created_by: ADMIN },
    ]);
  });

  it.each([
    ["a blank option", content({ option_b: "   " })],
    ["a stem that is only a number", content({ question_text: "34." })],
    ["an answer outside A to D", content({ correct_answer: "E" })],
  ])("refuses %s, and stores nothing", async (_label, bad) => {
    const { service, store } = setup();
    await expect(
      service.create(ADMIN, { examType: "RN", topic: "Pharmacology", content: bad }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(store.insertMany).not.toHaveBeenCalled();
  });

  it("refuses a blank topic", async () => {
    const { service } = setup();
    await expect(
      service.create(ADMIN, { examType: "RN", topic: "  ", content: content() }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("QuestionAdminService.import", () => {
  it("stores every question in one insert", async () => {
    const { service, store } = setup();
    const result = await service.import(ADMIN, {
      examType: "RM",
      topic: "Midwifery",
      questions: [content(), content({ question_text: "Second?" })],
    });
    expect(result).toEqual({ created: 2 });
    expect(store.insertMany).toHaveBeenCalledTimes(1);
    expect(vi.mocked(store.insertMany).mock.calls[0][0]).toHaveLength(2);
  });

  it("stores nothing when any question is incomplete, and says which one", async () => {
    const { service, store } = setup();
    const attempt = service.import(ADMIN, {
      examType: "RN",
      topic: "Pharmacology",
      questions: [content(), content({ option_c: "" }), content({ correct_answer: "Z" })],
    });
    await expect(attempt).rejects.toThrow(/Question 2.*option c/i);
    await expect(attempt).rejects.toThrow(/Question 3.*correct answer/);
    expect(store.insertMany).not.toHaveBeenCalled();
  });

  it("refuses an empty list and a list over the limit", async () => {
    const { service } = setup();
    await expect(
      service.import(ADMIN, { examType: "RN", topic: "T", questions: [] }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      service.import(ADMIN, {
        examType: "RN",
        topic: "T",
        questions: Array.from({ length: 501 }, () => content()),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("QuestionAdminService.update", () => {
  it("changes content and metadata of a question", async () => {
    const { service, store } = setup();
    await service.update({
      questionId: QUESTION,
      content: content({ rationale: "Because." }),
      difficulty: "hard",
      tags: ["drugs", "emergency"],
      source: null,
      subtopicId: SUBTOPIC,
    });
    expect(store.update).toHaveBeenCalledWith(QUESTION, {
      ...content({ rationale: "Because." }),
      difficulty: "hard",
      tags: ["drugs", "emergency"],
      source: null,
      subtopic_id: SUBTOPIC,
    });
  });

  it("changes only what it is given", async () => {
    const { service, store } = setup();
    await service.update({ questionId: QUESTION, difficulty: "easy" });
    expect(store.update).toHaveBeenCalledWith(QUESTION, { difficulty: "easy" });
  });

  it("refuses an update that names nothing to change", async () => {
    const { service, store } = setup();
    await expect(service.update({ questionId: QUESTION })).rejects.toBeInstanceOf(ValidationError);
    expect(store.update).not.toHaveBeenCalled();
  });

  it("refuses repaired content that is still incomplete", async () => {
    const { service, store } = setup();
    await expect(
      service.update({ questionId: QUESTION, content: content({ option_d: "" }) }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(store.update).not.toHaveBeenCalled();
  });

  it("refuses a subtopic of another exam type or topic", async () => {
    const { service, store } = setup({
      subtopicScope: vi.fn(async () => ({ examType: "RM" as const, topic: "Pharmacology" })),
    });
    await expect(
      service.update({ questionId: QUESTION, subtopicId: SUBTOPIC }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(store.update).not.toHaveBeenCalled();

    const wrongTopic = setup({
      subtopicScope: vi.fn(async () => ({ examType: "RN" as const, topic: "Anatomy" })),
    });
    await expect(
      wrongTopic.service.update({ questionId: QUESTION, subtopicId: SUBTOPIC }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("clears the subtopic without looking one up", async () => {
    const { service, store } = setup();
    await service.update({ questionId: QUESTION, subtopicId: null });
    expect(store.subtopicScope).not.toHaveBeenCalled();
    expect(store.update).toHaveBeenCalledWith(QUESTION, { subtopic_id: null });
  });

  it("is not found for a question or subtopic that does not exist", async () => {
    const noQuestion = setup({ questionScope: vi.fn(async () => null) });
    await expect(
      noQuestion.service.update({ questionId: QUESTION, subtopicId: SUBTOPIC }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const noSubtopic = setup({ subtopicScope: vi.fn(async () => null) });
    await expect(
      noSubtopic.service.update({ questionId: QUESTION, subtopicId: SUBTOPIC }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const gone = setup({ update: vi.fn(async () => false) });
    await expect(
      gone.service.update({ questionId: QUESTION, difficulty: "easy" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("QuestionAdminService retire and restore", () => {
  it("retires and restores by changing the status, never deleting", async () => {
    const { service, store } = setup();
    expect(await service.retire(QUESTION)).toEqual({ status: "retired" });
    expect(await service.restore(QUESTION)).toEqual({ status: "active" });
    expect(vi.mocked(store.setStatus).mock.calls).toEqual([
      [QUESTION, "retired"],
      [QUESTION, "active"],
    ]);
  });

  it("is not found for a question that does not exist", async () => {
    const { service } = setup({ setStatus: vi.fn(async () => false) });
    await expect(service.retire(QUESTION)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("QuestionAdminService subtopics", () => {
  it("creates a subtopic with a trimmed name", async () => {
    const { service, store } = setup();
    const created = await service.createSubtopic({
      examType: "RN",
      topic: "Pharmacology",
      name: "  Opioids ",
    });
    expect(store.createSubtopic).toHaveBeenCalledWith({
      examType: "RN",
      topic: "Pharmacology",
      name: "Opioids",
    });
    expect(created.id).toBe(SUBTOPIC);
  });

  it.each([[""], ["   "], ["x".repeat(121)]])("refuses the name %j", async (name) => {
    const { service, store } = setup();
    await expect(
      service.createSubtopic({ examType: "RN", topic: "Pharmacology", name }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(store.createSubtopic).not.toHaveBeenCalled();
  });

  it("renames, deletes and lists", async () => {
    const { service, store } = setup();
    expect(await service.renameSubtopic(SUBTOPIC, " Narcotics ")).toEqual({ renamed: true });
    expect(store.renameSubtopic).toHaveBeenCalledWith(SUBTOPIC, "Narcotics");
    expect(await service.deleteSubtopic(SUBTOPIC)).toEqual({ deleted: true });
    await service.listSubtopics({ examType: "RN" });
    expect(store.listSubtopics).toHaveBeenCalledWith("RN", undefined);
  });

  it("is not found when renaming or deleting a subtopic that does not exist", async () => {
    const { service } = setup({
      renameSubtopic: vi.fn(async () => false),
      deleteSubtopic: vi.fn(async () => false),
    });
    await expect(service.renameSubtopic(SUBTOPIC, "x")).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.deleteSubtopic(SUBTOPIC)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("QuestionAdminService delete", () => {
  it("asks the store to delete for good, naming the admin so the audit log can", async () => {
    const { service, store } = setup();
    expect(await service.delete(ADMIN, QUESTION)).toEqual({ deleted: true });
    expect(store.deleteForever).toHaveBeenCalledWith(ADMIN, QUESTION);
  });

  it("lets the store's refusal through (a question students answered, a missing one)", async () => {
    const { service } = setup({
      deleteForever: vi.fn(async () => {
        throw new NotFoundError("Question not found.");
      }),
    });
    await expect(service.delete(ADMIN, QUESTION)).rejects.toBeInstanceOf(NotFoundError);
  });
});
