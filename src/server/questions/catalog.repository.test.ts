import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "../testing/fake-supabase";
import { SupabaseCatalogRepository } from "./catalog.repository.server";

const query = (overrides = {}) => ({
  filter: { examType: "RN" as const, status: "active" as const },
  limit: 21,
  ...overrides,
});
const selectArg = (fake: ReturnType<typeof createFakeSupabase>) =>
  String(fake.callsOn("from:questions", "select")[0].args[0]);

describe("SupabaseCatalogRepository", () => {
  it("never selects the answer key or rationale for the student list", async () => {
    const fake = createFakeSupabase([{ data: [] }]);
    await new SupabaseCatalogRepository(fake.client).listSafe(query());
    const columns = selectArg(fake);
    expect(columns).not.toMatch(/correct_answer|rationale|\*/);
    expect(columns).toContain("question_text");
  });

  it("selects the key only for the admin list", async () => {
    const fake = createFakeSupabase([{ data: [] }]);
    await new SupabaseCatalogRepository(fake.client).listWithKey(query());
    expect(selectArg(fake)).toMatch(/correct_answer, rationale/);
  });

  it("applies every filter, the cursor, ordering and the limit", async () => {
    const fake = createFakeSupabase([{ data: [] }]);
    await new SupabaseCatalogRepository(fake.client).listSafe(
      query({
        cursor: "last-id",
        filter: {
          examType: "RM",
          status: "active",
          topics: ["A", "B"],
          subtopicIds: ["s1"],
          difficulty: ["hard"],
          yearFrom: 2018,
          yearTo: 2025,
        },
      }),
    );
    const calls = fake.recorded[0].chain.map((c) => [c.method, ...c.args]);
    expect(calls).toEqual(
      expect.arrayContaining([
        ["eq", "exam_type", "RM"],
        ["eq", "status", "active"],
        ["in", "topic", ["A", "B"]],
        ["in", "subtopic_id", ["s1"]],
        ["in", "difficulty", ["hard"]],
        ["gte", "year", 2018],
        ["lte", "year", 2025],
        ["gt", "id", "last-id"],
        ["order", "id", { ascending: true }],
        ["limit", 21],
      ]),
    );
  });

  it("skips the status filter for 'all' and empty arrays", async () => {
    const fake = createFakeSupabase([{ data: [] }]);
    await new SupabaseCatalogRepository(fake.client).listWithKey(
      query({ filter: { examType: "RN", status: "all", topics: [] } }),
    );
    const methods = fake.recorded[0].chain.map((c) => `${c.method}:${String(c.args[0])}`);
    expect(methods).not.toContain("eq:status");
    expect(methods).not.toContain("in:topic");
  });

  it("reads topic counts through the grouped function", async () => {
    const fake = createFakeSupabase([{ data: [{ topic: "Anatomy", total: 3 }] }]);
    await expect(new SupabaseCatalogRepository(fake.client).topicCounts("RN")).resolves.toEqual([
      { topic: "Anatomy", total: 3 },
    ]);
    expect(fake.callsOn("rpc:get_question_topic_counts", "args")[0].args[0]).toEqual({
      _exam_type: "RN",
    });
  });

  const validRow = {
    id: "123e4567-e89b-42d3-a456-426614174000",
    exam_type: "RN",
    topic: "Anatomy",
    subtopic_id: null,
    year: 2024,
    difficulty: "easy",
    tags: [],
    status: "active",
    source: null,
    updated_at: "2026-10-01T00:00:00Z",
    question_text: "Q?",
    option_a: "a",
    option_b: "b",
    option_c: "c",
    option_d: "d",
  };

  it("drops any extra column, such as the answer key, a query might return by mistake", async () => {
    const fake = createFakeSupabase([
      { data: [{ ...validRow, correct_answer: "B", rationale: "secret" }] },
    ]);
    const [row] = await new SupabaseCatalogRepository(fake.client).listSafe(query());
    expect(row).not.toHaveProperty("correct_answer");
    expect(row).not.toHaveProperty("rationale");
  });

  it("fails loudly on a malformed row instead of passing it on", async () => {
    const fake = createFakeSupabase([{ data: [{ ...validRow, exam_type: "MD" }] }]);
    await expect(new SupabaseCatalogRepository(fake.client).listSafe(query())).rejects.toThrow();
  });
});
