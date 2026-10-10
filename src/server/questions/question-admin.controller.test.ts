import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "../errors";

const store = vi.hoisted(() => ({
  insertMany: vi.fn(async (rows: readonly unknown[]) => rows.length),
  update: vi.fn(async () => true),
  setStatus: vi.fn(async () => true),
  questionScope: vi.fn(),
  subtopicScope: vi.fn(),
  listSubtopics: vi.fn(async () => []),
  createSubtopic: vi.fn(),
  renameSubtopic: vi.fn(async () => true),
  deleteSubtopic: vi.fn(async () => true),
}));
const assertAdmin = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
vi.mock("../access/admin-access.server", () => ({ assertAdmin }));
vi.mock("./question-admin.repository.server", () => ({
  SupabaseQuestionAdminStore: class {
    constructor() {
      return store;
    }
  },
}));

import { questionAdminController } from "./question-admin.controller.server";

const caller = { userId: "user-1", supabase: {} as never };
const ID = "00000000-0000-4000-8000-000000000002";
const content = {
  question_text: "Which drug reverses opioid overdose?",
  option_a: "Naloxone",
  option_b: "Atropine",
  option_c: "Heparin",
  option_d: "Insulin",
  correct_answer: "A",
  rationale: null,
};

const operations: Array<[string, () => Promise<unknown>]> = [
  ["create", () => questionAdminController.create(caller, { examType: "RN", topic: "T", content })],
  [
    "import",
    () =>
      questionAdminController.import(caller, { examType: "RN", topic: "T", questions: [content] }),
  ],
  ["update", () => questionAdminController.update(caller, { questionId: ID, difficulty: "easy" })],
  ["retire", () => questionAdminController.retire(caller, { questionId: ID })],
  ["restore", () => questionAdminController.restore(caller, { questionId: ID })],
  ["listSubtopics", () => questionAdminController.listSubtopics(caller, { examType: "RN" })],
  [
    "createSubtopic",
    () => questionAdminController.createSubtopic(caller, { examType: "RN", topic: "T", name: "N" }),
  ],
  [
    "renameSubtopic",
    () => questionAdminController.renameSubtopic(caller, { subtopicId: ID, name: "N" }),
  ],
  ["deleteSubtopic", () => questionAdminController.deleteSubtopic(caller, { subtopicId: ID })],
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("questionAdminController", () => {
  it.each(operations)(
    "%s: a non-admin is refused before anything is touched",
    async (_name, run) => {
      assertAdmin.mockRejectedValue(
        new ForbiddenError("You are not authorized to manage content."),
      );
      await expect(run()).rejects.toBeInstanceOf(ForbiddenError);
      for (const method of Object.values(store)) expect(method).not.toHaveBeenCalled();
    },
  );

  it("checks the signed-in user, then lets an admin create a question credited to them", async () => {
    assertAdmin.mockResolvedValue(undefined);
    expect(
      await questionAdminController.create(caller, { examType: "RN", topic: "T", content }),
    ).toEqual({ created: 1 });
    expect(assertAdmin).toHaveBeenCalledWith(caller.supabase, "user-1");
    expect(store.insertMany).toHaveBeenCalledWith([
      expect.objectContaining({ created_by: "user-1", exam_type: "RN", topic: "T" }),
    ]);
  });

  it("turns an unexpected failure into a generic error without its details", async () => {
    assertAdmin.mockResolvedValue(undefined);
    store.insertMany.mockRejectedValueOnce(new Error("relation questions locked"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      questionAdminController.create(caller, { examType: "RN", topic: "T", content }),
    ).rejects.toMatchObject({
      code: "INTERNAL",
      message: "Something went wrong. Please try again.",
    });
    errors.mockRestore();
  });
});
