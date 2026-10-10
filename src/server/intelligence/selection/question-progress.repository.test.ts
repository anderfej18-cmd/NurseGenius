import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "../../testing/fake-supabase";
import { SupabaseQuestionProgressStore } from "./question-progress.repository.server";

const USER = "user-1";
const row = (id: string, overrides: Record<string, unknown> = {}) => ({
  question_id: id,
  attempts: 3,
  misses: 2,
  unresolved: true,
  next_review_at: "2026-10-12T09:00:00.000Z",
  ...overrides,
});

describe("SupabaseQuestionProgressStore.listProgress", () => {
  it("reads only this student's statistics, with explicit columns, and maps them", async () => {
    const fake = createFakeSupabase([
      { data: [row("q1"), row("q2", { next_review_at: null, unresolved: false })] },
    ]);
    const progress = await new SupabaseQuestionProgressStore(fake.client).listProgress(USER);

    expect(fake.callsOn("from:user_question_stats", "eq")).toEqual([
      { method: "eq", args: ["user_id", USER] },
    ]);
    expect(String(fake.callsOn("from:user_question_stats", "select")[0].args[0])).toBe(
      "question_id, attempts, misses, unresolved, next_review_at",
    );
    expect(progress.get("q1")).toEqual({
      attempts: 3,
      misses: 2,
      unresolved: true,
      nextReviewAt: new Date("2026-10-12T09:00:00.000Z"),
    });
    expect(progress.get("q2")).toEqual({
      attempts: 3,
      misses: 2,
      unresolved: false,
      nextReviewAt: null,
    });
  });

  it("pages through all of a student's statistics with a keyset cursor", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, i) => row(`q${String(i).padStart(4, "0")}`));
    const fake = createFakeSupabase([{ data: firstPage }, { data: [row("q9999")] }]);
    const progress = await new SupabaseQuestionProgressStore(fake.client).listProgress(USER);
    expect(progress.size).toBe(1001);
    expect(fake.callsOn("from:user_question_stats", "gt")).toEqual([
      { method: "gt", args: ["question_id", "q0999"] },
    ]);
  });

  it("treats a student with no statistics as having no progress", async () => {
    const fake = createFakeSupabase([{ data: [] }]);
    expect((await new SupabaseQuestionProgressStore(fake.client).listProgress(USER)).size).toBe(0);
  });

  it("fails loudly on a malformed row and rethrows database errors", async () => {
    await expect(
      new SupabaseQuestionProgressStore(
        createFakeSupabase([{ data: [row("q1", { attempts: "many" })] }]).client,
      ).listProgress(USER),
    ).rejects.toThrow();
    const error = { message: "boom" };
    await expect(
      new SupabaseQuestionProgressStore(createFakeSupabase([{ error }]).client).listProgress(USER),
    ).rejects.toBe(error);
  });
});
