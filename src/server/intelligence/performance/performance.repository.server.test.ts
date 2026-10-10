import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "../../testing/fake-supabase";
import { SupabasePerformanceStore } from "./performance.repository.server";

describe("SupabasePerformanceStore", () => {
  it("counts the student's own completed tests whose score is not verified", async () => {
    const fake = createFakeSupabase([{ data: null }]);
    const store = new SupabasePerformanceStore(fake.client);
    expect(await store.countUnverifiedExams("user-1")).toBe(0);
    expect(fake.callsOn("from:exams", "eq").map((call) => call.args)).toEqual([
      ["user_id", "user-1"],
      ["status", "completed"],
      ["score_verified", false],
    ]);
  });

  it("raises a database failure", async () => {
    const fake = createFakeSupabase([{ error: { message: "boom" } }]);
    await expect(
      new SupabasePerformanceStore(fake.client).countUnverifiedExams("u"),
    ).rejects.toMatchObject({
      message: "boom",
    });
  });
});
