import { describe, expect, it } from "vitest";
import { STUDY_PLAN_CONFIG } from "../server/engagement/plans/study-plan.config";
import {
  dailyChallengeSchema,
  examDateSchema,
  studyPlanSchema,
  xpHistorySchema,
} from "./engagement.schemas";

describe("xpHistorySchema", () => {
  it("accepts an empty request and a page", () => {
    expect(xpHistorySchema.safeParse({}).success).toBe(true);
    expect(xpHistorySchema.safeParse({ limit: 50, offset: 10_000 }).success).toBe(true);
  });

  it.each([
    [{ limit: 0 }],
    [{ limit: 51 }],
    [{ offset: -1 }],
    [{ offset: 10_001 }],
    [{ limit: 1.5 }],
    [{ userId: "someone-else" }],
    [{ xp: 100 }],
  ])("rejects %j", (payload) => {
    expect(xpHistorySchema.safeParse(payload).success).toBe(false);
  });
});

describe("dailyChallengeSchema", () => {
  it("accepts no exam type, RN or RM", () => {
    expect(dailyChallengeSchema.safeParse({}).success).toBe(true);
    expect(dailyChallengeSchema.safeParse({ examType: "RN" }).success).toBe(true);
    expect(dailyChallengeSchema.safeParse({ examType: "RM" }).success).toBe(true);
  });

  it.each([
    [{ examType: "MD" }],
    [{ examType: "Both" }],
    [{ questionIds: ["q1"] }],
    [{ questions: 20 }],
    [{ userId: "someone-else" }],
  ])("rejects %j", (payload) => {
    expect(dailyChallengeSchema.safeParse(payload).success).toBe(false);
  });
});

describe("studyPlanSchema", () => {
  const { dailyMinutes, daysPerWeek, targetScore } = STUDY_PLAN_CONFIG;

  it("accepts no settings, and every setting at its limits", () => {
    expect(studyPlanSchema.safeParse({}).success).toBe(true);
    expect(
      studyPlanSchema.safeParse({
        examType: "RM",
        dailyMinutes: dailyMinutes.min,
        daysPerWeek: daysPerWeek.min,
        targetScore: targetScore.min,
      }).success,
    ).toBe(true);
    expect(
      studyPlanSchema.safeParse({
        dailyMinutes: dailyMinutes.max,
        daysPerWeek: daysPerWeek.max,
        targetScore: targetScore.max,
      }).success,
    ).toBe(true);
  });

  it.each([
    [{ dailyMinutes: dailyMinutes.min - 1 }],
    [{ dailyMinutes: dailyMinutes.max + 1 }],
    [{ daysPerWeek: daysPerWeek.min - 1 }],
    [{ daysPerWeek: daysPerWeek.max + 1 }],
    [{ targetScore: targetScore.min - 1 }],
    [{ targetScore: targetScore.max + 1 }],
    [{ dailyMinutes: 30.5 }],
    [{ examType: "Both" }],
    [{ examDate: "2027-01-01" }],
    [{ topics: ["Pharmacology"] }],
    [{ weeks: [] }],
    [{ userId: "someone-else" }],
  ])("rejects %j", (payload) => {
    expect(studyPlanSchema.safeParse(payload).success).toBe(false);
  });
});

describe("examDateSchema", () => {
  it("accepts a YYYY-MM-DD date", () => {
    expect(examDateSchema.parse({ examDate: "2026-12-01" })).toEqual({ examDate: "2026-12-01" });
  });

  it.each([
    [{}],
    [{ examDate: "12/01/2026" }],
    [{ examDate: "2026-12-01T00:00:00Z" }],
    [{ examDate: "soon" }],
    [{ examDate: "2026-12-01", userId: "someone-else" }],
  ])("rejects %j", (payload) => {
    expect(examDateSchema.safeParse(payload).success).toBe(false);
  });
});
