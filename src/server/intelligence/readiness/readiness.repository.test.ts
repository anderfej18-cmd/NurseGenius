import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "../../testing/fake-supabase";
import { SupabaseReadinessStore } from "./readiness.repository.server";

const USER = "user-1";

describe("SupabaseReadinessStore.getReadinessProfile", () => {
  it("reads only the exam date and preference of the student's own profile", async () => {
    const fake = createFakeSupabase([{ data: { exam_date: "2026-12-01", exam_preference: "RN" } }]);
    const profile = await new SupabaseReadinessStore(fake.client).getReadinessProfile(USER);

    expect(String(fake.callsOn("from:profiles", "select")[0].args[0])).toBe(
      "exam_date, exam_preference",
    );
    expect(fake.recorded[0].chain.map((c) => [c.method, ...c.args])).toEqual(
      expect.arrayContaining([["eq", "id", USER]]),
    );
    expect(profile).toEqual({ examDate: "2026-12-01", examPreference: "RN" });
  });

  it("keeps a missing date and preference as null", async () => {
    const fake = createFakeSupabase([{ data: { exam_date: null, exam_preference: null } }]);
    expect(await new SupabaseReadinessStore(fake.client).getReadinessProfile(USER)).toEqual({
      examDate: null,
      examPreference: null,
    });
  });

  it("reports a missing profile as null", async () => {
    const fake = createFakeSupabase([{ data: null }]);
    expect(await new SupabaseReadinessStore(fake.client).getReadinessProfile(USER)).toBeNull();
  });

  it("rethrows database errors", async () => {
    const error = { message: "boom" };
    const fake = createFakeSupabase([{ error }]);
    await expect(new SupabaseReadinessStore(fake.client).getReadinessProfile(USER)).rejects.toBe(
      error,
    );
  });
});

describe("SupabaseReadinessStore.recordSnapshot", () => {
  const snapshot = {
    examType: "RN" as const,
    score: 54.2,
    band: "developing",
    attempts: 340,
    completeness: 0.875,
    components: { mastery: 0.48, speed: null },
  };

  it("records the assessment for the named student and returns the latest two as dates and numbers", async () => {
    const fake = createFakeSupabase([
      {
        data: [
          { assessed_at: "2026-10-10T15:00:00+00:00", score: "54.2", attempts: 340 },
          { assessed_at: "2026-10-03T09:00:00+00:00", score: null, attempts: 5 },
        ],
      },
    ]);
    const rows = await new SupabaseReadinessStore(fake.client).recordSnapshot("user-1", snapshot);
    expect(rows).toEqual([
      { assessedAt: "2026-10-10T15:00:00.000Z", score: 54.2, attempts: 340 },
      { assessedAt: "2026-10-03T09:00:00.000Z", score: null, attempts: 5 },
    ]);
    const [call] = fake.callsOn("rpc:record_readiness_snapshot", "args");
    expect(call.args[0]).toMatchObject({ _user_id: "user-1", _exam_type: "RN", _attempts: 340 });
  });

  it("sends no score when there is none yet", async () => {
    const fake = createFakeSupabase([{ data: [] }]);
    await new SupabaseReadinessStore(fake.client).recordSnapshot("user-1", {
      ...snapshot,
      score: null,
    });
    const [call] = fake.callsOn("rpc:record_readiness_snapshot", "args");
    expect((call.args[0] as { _score?: number })._score).toBeUndefined();
  });

  it("raises a database failure", async () => {
    const fake = createFakeSupabase([{ error: { message: "boom" } }]);
    await expect(
      new SupabaseReadinessStore(fake.client).recordSnapshot("user-1", snapshot),
    ).rejects.toMatchObject({ message: "boom" });
  });
});
