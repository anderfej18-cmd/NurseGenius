import { describe, expect, it } from "vitest";
import {
  dailyRecommendationSchema,
  examReadinessSchema,
  listDueReviewsSchema,
  periodSchema,
  similarQuestionsSchema,
} from "./intelligence.schemas";

describe("listDueReviewsSchema", () => {
  it("accepts an empty request and every filter", () => {
    expect(listDueReviewsSchema.safeParse({}).success).toBe(true);
    expect(
      listDueReviewsSchema.safeParse({ examType: "RM", topic: "Ethics", limit: 10, offset: 20 })
        .success,
    ).toBe(true);
  });

  it.each([
    [{ examType: "MD" }],
    [{ topic: "" }],
    [{ limit: 51 }],
    [{ limit: 0 }],
    [{ offset: -1 }],
    [{ offset: 10_001 }],
    [{ userId: "someone-else" }],
    [{ nextReviewAt: "2020-01-01" }],
  ])("rejects %j", (payload) => {
    expect(listDueReviewsSchema.safeParse(payload).success).toBe(false);
  });
});

describe("similarQuestionsSchema", () => {
  const uuid = "123e4567-e89b-42d3-a456-426614174000";

  it("accepts a question id with an optional limit", () => {
    expect(similarQuestionsSchema.safeParse({ questionId: uuid }).success).toBe(true);
    expect(similarQuestionsSchema.safeParse({ questionId: uuid, limit: 20 }).success).toBe(true);
  });

  it.each([
    [{}],
    [{ questionId: "q1" }],
    [{ questionId: uuid, limit: 21 }],
    [{ questionId: uuid, limit: 0 }],
    [{ questionId: uuid, userId: uuid }],
    [{ questionId: uuid, includeAnswers: true }],
  ])("rejects %j", (payload) => {
    expect(similarQuestionsSchema.safeParse(payload).success).toBe(false);
  });
});

describe("periodSchema", () => {
  it("accepts no period or a period of 1 to 365 days", () => {
    expect(periodSchema.safeParse({}).success).toBe(true);
    expect(periodSchema.safeParse({ periodDays: 1 }).success).toBe(true);
    expect(periodSchema.safeParse({ periodDays: 365 }).success).toBe(true);
  });

  it.each([[{ periodDays: 0 }], [{ periodDays: 366 }], [{ periodDays: 1.5 }], [{ userId: "x" }]])(
    "rejects %j",
    (payload) => {
      expect(periodSchema.safeParse(payload).success).toBe(false);
    },
  );
});

describe("dailyRecommendationSchema", () => {
  it("accepts no time or 10 to 240 minutes", () => {
    expect(dailyRecommendationSchema.safeParse({}).success).toBe(true);
    expect(dailyRecommendationSchema.safeParse({ availableMinutes: 10 }).success).toBe(true);
    expect(dailyRecommendationSchema.safeParse({ availableMinutes: 240 }).success).toBe(true);
  });

  it.each([
    [{ availableMinutes: 9 }],
    [{ availableMinutes: 241 }],
    [{ availableMinutes: 30.5 }],
    [{ questions: 50 }],
  ])("rejects %j", (payload) => {
    expect(dailyRecommendationSchema.safeParse(payload).success).toBe(false);
  });
});

describe("examReadinessSchema", () => {
  it("accepts no exam type, RN or RM", () => {
    expect(examReadinessSchema.safeParse({}).success).toBe(true);
    expect(examReadinessSchema.safeParse({ examType: "RN" }).success).toBe(true);
    expect(examReadinessSchema.safeParse({ examType: "RM" }).success).toBe(true);
  });

  it.each([[{ examType: "MD" }], [{ examType: "Both" }], [{ userId: "x" }]])(
    "rejects %j",
    (payload) => {
      expect(examReadinessSchema.safeParse(payload).success).toBe(false);
    },
  );
});
