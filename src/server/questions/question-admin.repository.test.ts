import { describe, expect, it } from "vitest";
import { ConflictError } from "../errors";
import { createFakeSupabase } from "../testing/fake-supabase";
import type { NewQuestionRow } from "./question-admin.service";
import { SupabaseQuestionAdminStore } from "./question-admin.repository.server";

const ID = "00000000-0000-4000-8000-000000000002";
const SUBTOPIC = "00000000-0000-4000-8000-000000000001";
const row: NewQuestionRow = {
  question_text: "Q?",
  option_a: "a",
  option_b: "b",
  option_c: "c",
  option_d: "d",
  correct_answer: "A",
  rationale: null,
  exam_type: "RN",
  topic: "Pharmacology",
  created_by: "admin-1",
};
const callsOn = (fake: ReturnType<typeof createFakeSupabase>, target: string, method: string) =>
  fake.callsOn(target, method).map((call) => call.args);

describe("SupabaseQuestionAdminStore questions", () => {
  it("inserts all rows in one statement and counts what was stored", async () => {
    const fake = createFakeSupabase([{ data: [{ id: "1" }, { id: "2" }] }]);
    const count = await new SupabaseQuestionAdminStore(fake.client).insertMany([row, row]);
    expect(count).toBe(2);
    expect(callsOn(fake, "from:questions", "insert")).toEqual([[[row, row]]]);
    expect(fake.recorded).toHaveLength(1);
  });

  it("surfaces a database error from an insert", async () => {
    const fake = createFakeSupabase([{ error: { message: "boom" } }]);
    await expect(
      new SupabaseQuestionAdminStore(fake.client).insertMany([row]),
    ).rejects.toMatchObject({ message: "boom" });
  });

  it("updates one question by id and says whether it existed", async () => {
    const found = createFakeSupabase([{ data: [{ id: ID }] }]);
    expect(
      await new SupabaseQuestionAdminStore(found.client).update(ID, { difficulty: "hard" }),
    ).toBe(true);
    expect(callsOn(found, "from:questions", "update")).toEqual([[{ difficulty: "hard" }]]);
    expect(callsOn(found, "from:questions", "eq")).toEqual([["id", ID]]);

    const missing = createFakeSupabase([{ data: [] }]);
    expect(await new SupabaseQuestionAdminStore(missing.client).update(ID, { source: null })).toBe(
      false,
    );
  });

  it("sets the status of one question, and never deletes", async () => {
    const fake = createFakeSupabase([{ data: [{ id: ID }] }]);
    expect(await new SupabaseQuestionAdminStore(fake.client).setStatus(ID, "retired")).toBe(true);
    expect(callsOn(fake, "from:questions", "update")).toEqual([[{ status: "retired" }]]);
    expect(callsOn(fake, "from:questions", "eq")).toEqual([["id", ID]]);
    expect(fake.callsOn("from:questions", "delete")).toEqual([]);
  });

  it("reads the exam type and topic of a question, or null", async () => {
    const found = createFakeSupabase([{ data: { exam_type: "RM", topic: "Midwifery" } }]);
    expect(await new SupabaseQuestionAdminStore(found.client).questionScope(ID)).toEqual({
      examType: "RM",
      topic: "Midwifery",
    });
    const missing = createFakeSupabase([{ data: null }]);
    expect(await new SupabaseQuestionAdminStore(missing.client).questionScope(ID)).toBeNull();
  });
});

describe("SupabaseQuestionAdminStore subtopics", () => {
  const stored = { id: SUBTOPIC, exam_type: "RN", topic: "Pharmacology", name: "Opioids" };
  const subtopic = { id: SUBTOPIC, examType: "RN", topic: "Pharmacology", name: "Opioids" };

  it("reads the scope of a subtopic, or null", async () => {
    const found = createFakeSupabase([{ data: { exam_type: "RN", topic: "Pharmacology" } }]);
    expect(await new SupabaseQuestionAdminStore(found.client).subtopicScope(SUBTOPIC)).toEqual({
      examType: "RN",
      topic: "Pharmacology",
    });
    const missing = createFakeSupabase([{ data: null }]);
    expect(await new SupabaseQuestionAdminStore(missing.client).subtopicScope(SUBTOPIC)).toBeNull();
  });

  it("lists an exam type's subtopics, narrowed by topic when asked, within a bound", async () => {
    const fake = createFakeSupabase([{ data: [stored] }]);
    const list = await new SupabaseQuestionAdminStore(fake.client).listSubtopics(
      "RN",
      "Pharmacology",
    );
    expect(list).toEqual([subtopic]);
    expect(callsOn(fake, "from:subtopics", "eq")).toEqual([
      ["exam_type", "RN"],
      ["topic", "Pharmacology"],
    ]);
    expect(callsOn(fake, "from:subtopics", "limit")).toEqual([[500]]);

    const all = createFakeSupabase([{ data: [] }]);
    await new SupabaseQuestionAdminStore(all.client).listSubtopics("RM");
    expect(callsOn(all, "from:subtopics", "eq")).toEqual([["exam_type", "RM"]]);
  });

  it("creates a subtopic and returns it", async () => {
    const fake = createFakeSupabase([{ data: stored }]);
    const created = await new SupabaseQuestionAdminStore(fake.client).createSubtopic({
      examType: "RN",
      topic: "Pharmacology",
      name: "Opioids",
    });
    expect(created).toEqual(subtopic);
    expect(callsOn(fake, "from:subtopics", "insert")).toEqual([
      [{ exam_type: "RN", topic: "Pharmacology", name: "Opioids" }],
    ]);
  });

  it("turns a duplicate name into a conflict, on create and on rename", async () => {
    const duplicate = { error: { message: "duplicate key", code: "23505" } };
    await expect(
      new SupabaseQuestionAdminStore(createFakeSupabase([duplicate]).client).createSubtopic({
        examType: "RN",
        topic: "Pharmacology",
        name: "Opioids",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      new SupabaseQuestionAdminStore(createFakeSupabase([duplicate]).client).renameSubtopic(
        SUBTOPIC,
        "Opioids",
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("renames and deletes one subtopic by id and says whether it existed", async () => {
    const renamed = createFakeSupabase([{ data: [{ id: SUBTOPIC }] }]);
    expect(
      await new SupabaseQuestionAdminStore(renamed.client).renameSubtopic(SUBTOPIC, "New"),
    ).toBe(true);
    expect(callsOn(renamed, "from:subtopics", "update")).toEqual([[{ name: "New" }]]);
    expect(callsOn(renamed, "from:subtopics", "eq")).toEqual([["id", SUBTOPIC]]);

    const deleted = createFakeSupabase([{ data: [] }]);
    expect(await new SupabaseQuestionAdminStore(deleted.client).deleteSubtopic(SUBTOPIC)).toBe(
      false,
    );
    expect(callsOn(deleted, "from:subtopics", "eq")).toEqual([["id", SUBTOPIC]]);
  });
});
