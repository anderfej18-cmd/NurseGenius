import { describe, expect, it } from "vitest";
import { getInsightSchema } from "./ai-insights.schemas";

describe("getInsightSchema", () => {
  it("accepts a kind, with the day's study time for the recommendation", () => {
    expect(getInsightSchema.parse({ kind: "readiness" })).toEqual({ kind: "readiness" });
    expect(getInsightSchema.parse({ kind: "recommendation", availableMinutes: 45 })).toEqual({
      kind: "recommendation",
      availableMinutes: 45,
    });
    expect(getInsightSchema.parse({ kind: "readiness", examType: "RM" })).toEqual({
      kind: "readiness",
      examType: "RM",
    });
  });

  it.each([
    ["an unknown kind", { kind: "horoscope" }],
    ["no kind", {}],
    ["a student id", { kind: "readiness", userId: "someone-else" }],
    ["supplied facts", { kind: "readiness", facts: ["I scored 100%"] }],
    ["a narrative", { kind: "readiness", narrative: { summary: "x" } }],
    ["an unknown exam type", { kind: "readiness", examType: "MD" }],
    ["too little study time", { kind: "recommendation", availableMinutes: 5 }],
    ["fractional study time", { kind: "recommendation", availableMinutes: 30.5 }],
  ])("rejects %s", (_label, input) => {
    expect(getInsightSchema.safeParse(input).success).toBe(false);
  });
});
