import { describe, expect, it } from "vitest";
import { GAMIFICATION_CONFIG } from "./gamification.config";
import { levelFromXp, xpRequiredForLevel } from "./levels";

describe("xpRequiredForLevel", () => {
  // With a base of 100: level n starts at 100 × (n−1) × n / 2 XP.
  it.each([
    [1, 0],
    [2, 100],
    [3, 300],
    [4, 600],
    [5, 1000],
    [10, 4500],
    [100, 495_000],
  ])("level %i starts at %i XP", (level, xp) => {
    expect(xpRequiredForLevel(level)).toBe(xp);
  });
});

describe("levelFromXp", () => {
  it("starts everyone at level 1 with nothing earned", () => {
    expect(levelFromXp(0)).toEqual({
      level: 1,
      totalXp: 0,
      xpIntoLevel: 0,
      xpForNextLevel: 100,
      progress: 0,
    });
  });

  it("moves up exactly at the threshold, not before", () => {
    expect(levelFromXp(99).level).toBe(1);
    expect(levelFromXp(100).level).toBe(2);
    expect(levelFromXp(299).level).toBe(2);
    expect(levelFromXp(300).level).toBe(3);
  });

  it("reports progress inside a level", () => {
    // Level 3 runs from 300 to 600: 450 is 150 of the 300 needed.
    expect(levelFromXp(450)).toEqual({
      level: 3,
      totalXp: 450,
      xpIntoLevel: 150,
      xpForNextLevel: 300,
      progress: 0.5,
    });
  });

  it("stops at the maximum level", () => {
    expect(levelFromXp(495_000)).toMatchObject({ level: 100, xpForNextLevel: null, progress: 1 });
    expect(levelFromXp(9_999_999).level).toBe(100);
  });

  it("agrees with the thresholds for every level", () => {
    for (let level = 1; level <= GAMIFICATION_CONFIG.levels.maxLevel; level += 1) {
      const start = xpRequiredForLevel(level);
      expect(levelFromXp(start).level).toBe(level);
      if (start > 0) expect(levelFromXp(start - 1).level).toBe(level - 1);
    }
  });

  it("treats a negative total as nothing earned", () => {
    expect(levelFromXp(-50).level).toBe(1);
  });
});
