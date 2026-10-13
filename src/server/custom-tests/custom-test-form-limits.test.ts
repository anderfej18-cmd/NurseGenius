import { describe, expect, it } from "vitest";
import { CUSTOM_TEST_LIMITS } from "@/lib/custom-test-form";
import { CUSTOM_TEST_CONFIG } from "./custom-tests.config";

// The admin form checks its fields before sending; these limits must stay the ones the server enforces.
describe("the Create a test form uses the server's limits", () => {
  it("has the same question and duration bounds", () => {
    expect(CUSTOM_TEST_LIMITS.questions).toEqual({
      min: CUSTOM_TEST_CONFIG.minQuestions,
      max: CUSTOM_TEST_CONFIG.maxQuestions,
    });
    expect(CUSTOM_TEST_LIMITS.windowMinutes.max).toBe(CUSTOM_TEST_CONFIG.maxWindowDays * 24 * 60);
    expect(CUSTOM_TEST_LIMITS.minutes).toEqual({
      min: CUSTOM_TEST_CONFIG.minDurationMinutes,
      max: CUSTOM_TEST_CONFIG.maxDurationMinutes,
    });
  });
});
