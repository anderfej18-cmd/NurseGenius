import { describe, expect, it } from "vitest";
import { LimitReachedError } from "@/lib/app-errors";
import { assertWithinTierLimits, effectiveTier, questionsUsedToday, remainingToday } from "./quota";
import type { Quota } from "./session.types";

const NOW = new Date("2026-10-06T10:00:00.000Z");
const quota = (overrides: Partial<Quota> = {}): Quota => ({
  tier: "novice",
  expiryDate: null,
  questionsToday: 0,
  lastQuestionDate: null,
  ...overrides,
});

describe("effectiveTier", () => {
  it("keeps a paid tier until its expiry, and falls back to novice afterwards", () => {
    expect(effectiveTier(quota({ tier: "scholar", expiryDate: "2026-12-01T00:00:00Z" }), NOW)).toBe(
      "scholar",
    );
    expect(effectiveTier(quota({ tier: "scholar", expiryDate: "2026-10-01T00:00:00Z" }), NOW)).toBe(
      "novice",
    );
  });

  it("keeps a tier that has no expiry", () => {
    expect(effectiveTier(quota({ tier: "erudite" }), NOW)).toBe("erudite");
  });
});

describe("questionsUsedToday", () => {
  it("counts today's questions, and nothing from an earlier day", () => {
    expect(
      questionsUsedToday(quota({ questionsToday: 30, lastQuestionDate: "2026-10-06" }), NOW),
    ).toBe(30);
    expect(
      questionsUsedToday(quota({ questionsToday: 30, lastQuestionDate: "2026-10-05" }), NOW),
    ).toBe(0);
    expect(questionsUsedToday(quota({ questionsToday: 30, lastQuestionDate: null }), NOW)).toBe(0);
  });
});

describe("remainingToday", () => {
  it("is the tier's daily allowance minus today's questions", () => {
    expect(remainingToday(quota({ questionsToday: 45, lastQuestionDate: "2026-10-06" }), NOW)).toBe(
      5,
    );
    expect(remainingToday(quota(), NOW)).toBe(50);
  });

  it("is never negative", () => {
    expect(remainingToday(quota({ questionsToday: 80, lastQuestionDate: "2026-10-06" }), NOW)).toBe(
      0,
    );
  });

  it("is unlimited (null) for a tier without a daily cap", () => {
    expect(
      remainingToday(
        quota({
          tier: "scholar",
          expiryDate: "2026-12-01T00:00:00Z",
          questionsToday: 9999,
          lastQuestionDate: "2026-10-06",
        }),
        NOW,
      ),
    ).toBeNull();
  });

  it("uses the novice allowance once a paid tier has expired", () => {
    expect(
      remainingToday(quota({ tier: "scholar", expiryDate: "2026-10-01T00:00:00Z" }), NOW),
    ).toBe(50);
  });
});

describe("assertWithinTierLimits", () => {
  const today = "2026-10-06";

  it("allows a session within the tier's limits", () => {
    expect(() => assertWithinTierLimits(quota(), 50, NOW)).not.toThrow();
    expect(() => assertWithinTierLimits(quota({ tier: "erudite" }), 150, NOW)).not.toThrow();
  });

  it("refuses a session larger than the tier allows, naming the cap", () => {
    expect(() => assertWithinTierLimits(quota(), 51, NOW)).toThrow(
      new LimitReachedError("novice tier allows max 50 questions per quiz."),
    );
  });

  it("refuses once the day's allowance is used up", () => {
    const used = quota({ questionsToday: 50, lastQuestionDate: today });
    expect(() => assertWithinTierLimits(used, 5, NOW)).toThrow(
      new LimitReachedError(
        "You've hit your daily limit. Upgrade your tier or come back tomorrow.",
      ),
    );
  });

  it("refuses a session larger than what is left today, saying how much is left", () => {
    const some = quota({ questionsToday: 40, lastQuestionDate: today });
    expect(() => assertWithinTierLimits(some, 11, NOW)).toThrow(
      new LimitReachedError("Only 10 questions left today on your tier."),
    );
    expect(() => assertWithinTierLimits(some, 10, NOW)).not.toThrow();
  });

  it("starts a fresh allowance on a new day", () => {
    const yesterday = quota({ questionsToday: 50, lastQuestionDate: "2026-10-05" });
    expect(() => assertWithinTierLimits(yesterday, 50, NOW)).not.toThrow();
  });

  it("has no daily cap for the top tier, but still a session cap", () => {
    const scholar = quota({ tier: "scholar", questionsToday: 9999, lastQuestionDate: today });
    expect(() => assertWithinTierLimits(scholar, 250, NOW)).not.toThrow();
    expect(() => assertWithinTierLimits(scholar, 251, NOW)).toThrow(LimitReachedError);
  });

  it("treats an expired paid tier as novice", () => {
    const expired = quota({ tier: "scholar", expiryDate: "2026-10-01T00:00:00Z" });
    expect(() => assertWithinTierLimits(expired, 51, NOW)).toThrow(LimitReachedError);
  });
});
