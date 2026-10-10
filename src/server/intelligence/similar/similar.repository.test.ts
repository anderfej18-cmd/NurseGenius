import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "../../testing/fake-supabase";
import type { SimilarSource } from "./similar-questions";
import { SupabaseSimilarStore } from "./similar.repository.server";

const source: SimilarSource = {
  id: "q1",
  examType: "RN",
  topic: "Anatomy",
  subtopicId: "sub-1",
  difficulty: "medium",
  tags: ["bones"],
  questionText: "Q?",
};
const chain = (fake: ReturnType<typeof createFakeSupabase>, index = 0) =>
  fake.recorded[index].chain.map((c) => [c.method, ...c.args]);
const row = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  exam_type: "RN",
  topic: "Anatomy",
  subtopic_id: null,
  difficulty: null,
  tags: ["bones"],
  year: 2024,
  question_text: "Q?",
  option_a: "a",
  option_b: "b",
  option_c: "c",
  option_d: "d",
  ...overrides,
});

describe("SupabaseSimilarStore.getSource", () => {
  it("maps the question's metadata", async () => {
    const fake = createFakeSupabase([
      {
        data: {
          id: "q1",
          exam_type: "RN",
          topic: "Anatomy",
          subtopic_id: "sub-1",
          difficulty: "hard",
          tags: ["bones"],
          question_text: "Which bone is longest?",
        },
      },
    ]);
    await expect(new SupabaseSimilarStore(fake.client).getSource("q1")).resolves.toEqual({
      id: "q1",
      examType: "RN",
      topic: "Anatomy",
      subtopicId: "sub-1",
      difficulty: "hard",
      tags: ["bones"],
      questionText: "Which bone is longest?",
    });
    expect(chain(fake)).toEqual(expect.arrayContaining([["eq", "id", "q1"]]));
  });

  it("returns null for an unknown question", async () => {
    const fake = createFakeSupabase([{ data: null }]);
    await expect(new SupabaseSimilarStore(fake.client).getSource("nope")).resolves.toBeNull();
  });
});

describe("SupabaseSimilarStore.listCandidates", () => {
  it("looks for active questions of the same exam type in the topic and, if any, the subtopic, as separate queries", async () => {
    const fake = createFakeSupabase([
      { data: [row("a")] },
      { data: [row("b", { subtopic_id: "sub-1", topic: "Other" })] },
    ]);
    const found = await new SupabaseSimilarStore(fake.client).listCandidates(source, 300);

    expect(found.map((c) => c.id)).toEqual(["a", "b"]);
    expect(chain(fake, 0)).toEqual(
      expect.arrayContaining([
        ["eq", "exam_type", "RN"],
        ["eq", "status", "active"],
        ["eq", "topic", "Anatomy"],
        ["neq", "id", "q1"],
        ["limit", 300],
      ]),
    );
    expect(chain(fake, 1)).toEqual(
      expect.arrayContaining([
        ["eq", "subtopic_id", "sub-1"],
        ["eq", "status", "active"],
      ]),
    );
  });

  it("builds no filter from text: every condition is a bound builder call, never an or() string", async () => {
    const fake = createFakeSupabase([{ data: [] }, { data: [] }]);
    await new SupabaseSimilarStore(fake.client).listCandidates(
      { ...source, topic: "x),id.neq.y,(" },
      300,
    );
    expect(fake.recorded.flatMap((r) => r.chain.map((c) => c.method))).not.toContain("or");
  });

  it("skips the subtopic query when the question has no subtopic, and lists a question found twice once", async () => {
    const fake = createFakeSupabase([{ data: [row("a")] }]);
    await new SupabaseSimilarStore(fake.client).listCandidates(
      { ...source, subtopicId: null },
      300,
    );
    expect(fake.recorded).toHaveLength(1);

    const twice = createFakeSupabase([{ data: [row("a")] }, { data: [row("a")] }]);
    expect(await new SupabaseSimilarStore(twice.client).listCandidates(source, 300)).toHaveLength(
      1,
    );
  });

  it("selects question content without the answer key", async () => {
    const fake = createFakeSupabase([{ data: [] }, { data: [] }]);
    await new SupabaseSimilarStore(fake.client).listCandidates(source, 300);
    expect(String(fake.callsOn("from:questions", "select")[0].args[0])).not.toMatch(
      /correct_answer|rationale|\*/,
    );
  });

  it("fails loudly on a malformed row", async () => {
    const fake = createFakeSupabase([{ data: [row("a", { exam_type: "MD" })] }, { data: [] }]);
    await expect(
      new SupabaseSimilarStore(fake.client).listCandidates(source, 300),
    ).rejects.toThrow();
  });
});

describe("SupabaseSimilarStore: what is read", () => {
  it("reads the source's wording but never the answer key or the rationale", async () => {
    const fake = createFakeSupabase([{ data: null }]);
    await new SupabaseSimilarStore(fake.client).getSource("q1");
    const columns = String(fake.callsOn("from:questions", "select")[0].args[0]);
    expect(columns).toContain("question_text");
    expect(columns).not.toMatch(/correct_answer|rationale/);
  });
});
