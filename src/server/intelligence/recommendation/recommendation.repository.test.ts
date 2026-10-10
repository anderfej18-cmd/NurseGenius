import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "../../testing/fake-supabase";
import { SupabaseRecommendationStore } from "./recommendation.repository.server";

const USER = "user-1";
const chain = (fake: ReturnType<typeof createFakeSupabase>) =>
  fake.recorded[0].chain.map((c) => [c.method, ...c.args]);

describe("SupabaseRecommendationStore.countUnresolvedMistakes", () => {
  it("counts only this student's unresolved mistakes", async () => {
    const fake = createFakeSupabase([{ data: null }]);
    await new SupabaseRecommendationStore(fake.client).countUnresolvedMistakes(USER);
    expect(chain(fake)).toEqual(
      expect.arrayContaining([
        ["eq", "user_id", USER],
        ["eq", "unresolved", true],
      ]),
    );
  });

  it("rethrows database errors", async () => {
    const error = { message: "boom" };
    const fake = createFakeSupabase([{ error }]);
    await expect(
      new SupabaseRecommendationStore(fake.client).countUnresolvedMistakes(USER),
    ).rejects.toBe(error);
  });
});

describe("SupabaseRecommendationStore.getStudyProfile", () => {
  const row = {
    exam_date: "2026-12-01",
    tier: "erudite",
    expiry_date: "2027-01-01T00:00:00Z",
    questions_today: 12,
    last_question_date: "2026-10-10",
  };

  it("reads only the exam date and the quota fields of the student's own profile", async () => {
    const fake = createFakeSupabase([{ data: row }]);
    const profile = await new SupabaseRecommendationStore(fake.client).getStudyProfile(USER);

    expect(String(fake.callsOn("from:profiles", "select")[0].args[0])).toBe(
      "exam_date, tier, expiry_date, questions_today, last_question_date",
    );
    expect(chain(fake)).toEqual(expect.arrayContaining([["eq", "id", USER]]));
    expect(profile).toEqual({
      examDate: "2026-12-01",
      quota: {
        tier: "erudite",
        expiryDate: "2027-01-01T00:00:00Z",
        questionsToday: 12,
        lastQuestionDate: "2026-10-10",
      },
    });
  });

  it("keeps a missing exam date as null, and reports a missing profile as null", async () => {
    const noDate = createFakeSupabase([{ data: { ...row, exam_date: null } }]);
    expect(
      (await new SupabaseRecommendationStore(noDate.client).getStudyProfile(USER))?.examDate,
    ).toBeNull();
    const missing = createFakeSupabase([{ data: null }]);
    expect(await new SupabaseRecommendationStore(missing.client).getStudyProfile(USER)).toBeNull();
  });

  it("fails loudly on a tier the schema does not allow", async () => {
    const fake = createFakeSupabase([{ data: { ...row, tier: "platinum" } }]);
    await expect(
      new SupabaseRecommendationStore(fake.client).getStudyProfile(USER),
    ).rejects.toThrow();
  });
});
