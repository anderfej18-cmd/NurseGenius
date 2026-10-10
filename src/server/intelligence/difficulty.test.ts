import { describe, expect, it } from "vitest";
import { empiricalDifficulty, resolveDifficulty } from "./difficulty";
import { EMPIRICAL_DIFFICULTY } from "./intelligence.config";

describe("empiricalDifficulty", () => {
  it("is unknown without outcome data or below the minimum sample", () => {
    expect(empiricalDifficulty(undefined)).toBeNull();
    expect(empiricalDifficulty({ attempts: 19, correct: 19 })).toBeNull();
  });

  it.each([
    [{ attempts: 20, correct: 15 }, "easy"], // 75% is the lower edge of easy
    [{ attempts: 40, correct: 40 }, "easy"],
    [{ attempts: 20, correct: 14 }, "medium"], // 70%
    [{ attempts: 20, correct: 10 }, "medium"], // 50%
    [{ attempts: 20, correct: 9 }, "hard"], // 45% is the upper edge of hard
    [{ attempts: 100, correct: 5 }, "hard"],
  ] as const)("classifies %j as %s", (counts, expected) => {
    expect(empiricalDifficulty(counts)).toBe(expected);
  });

  it("uses the configured thresholds", () => {
    const strict = { ...EMPIRICAL_DIFFICULTY, minAttempts: 2 };
    expect(empiricalDifficulty({ attempts: 2, correct: 2 }, strict)).toBe("easy");
  });
});

describe("resolveDifficulty", () => {
  it("prefers the difficulty an admin set", () => {
    expect(resolveDifficulty("hard", { attempts: 100, correct: 100 })).toBe("hard");
  });

  it("falls back to the empirical difficulty, then to unknown", () => {
    expect(resolveDifficulty(null, { attempts: 100, correct: 100 })).toBe("easy");
    expect(resolveDifficulty(null, undefined)).toBeNull();
  });
});
