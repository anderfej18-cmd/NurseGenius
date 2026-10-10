import { describe, expect, it } from "vitest";
import { examUrgency } from "./exam-urgency";

const DAYS = { high: 14, medium: 30, low: 60 };

describe("examUrgency", () => {
  it.each([
    [0, "high"],
    [14, "high"],
    [15, "medium"],
    [30, "medium"],
    [31, "low"],
    [60, "low"],
    [61, "none"],
    [400, "none"],
  ] as const)("%i days to the exam is %s", (days, urgency) => {
    expect(examUrgency(days, DAYS)).toBe(urgency);
  });

  it("is none without a date and once the exam has passed", () => {
    expect(examUrgency(null, DAYS)).toBe("none");
    expect(examUrgency(-1, DAYS)).toBe("none");
  });
});
