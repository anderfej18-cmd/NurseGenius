import { describe, expect, it } from "vitest";
import { validatePlanSettings } from "./plan-form";

describe("study plan form checks", () => {
  it("accepts values inside every range, including the edges", () => {
    expect(validatePlanSettings({ dailyMinutes: 10, daysPerWeek: 1, targetScore: 50 })).toEqual({});
    expect(validatePlanSettings({ dailyMinutes: 240, daysPerWeek: 7, targetScore: 100 })).toEqual(
      {},
    );
  });

  it("names each field that is out of range or not a whole number", () => {
    const errors = validatePlanSettings({
      dailyMinutes: 5,
      daysPerWeek: 3.5,
      targetScore: Number.NaN,
    });
    expect(Object.keys(errors).sort()).toEqual(["dailyMinutes", "daysPerWeek", "targetScore"]);
    expect(errors.dailyMinutes).toContain("10 to 240");
  });
});
