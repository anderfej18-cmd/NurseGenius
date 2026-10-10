import { describe, expect, it } from "vitest";
import { STREAK_CONFIG } from "./streak.config";
import { computeStreak, type StudyDay } from "./streak";

const NOW = new Date("2026-10-10T15:00:00.000Z");

const day = (date: string, answered = 5): StudyDay => ({ day: date, answered });
/** `count` consecutive days ending on `last`, as YYYY-MM-DD. */
const run = (last: string, count: number): StudyDay[] =>
  Array.from({ length: count }, (_, index) => {
    const date = new Date(`${last}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - index);
    return day(date.toISOString().slice(0, 10));
  });

describe("computeStreak: current streak", () => {
  it("is empty for a student who has never studied", () => {
    expect(computeStreak([], NOW)).toEqual({
      current: 0,
      longest: 0,
      studiedToday: false,
      atRisk: false,
      lastStudyDay: null,
      daysStudiedLast7: 0,
      daysStudiedLast30: 0,
      minQuestionsPerDay: 5,
      nextMilestone: { days: 3, remaining: 3 },
    });
  });

  it("is 1 after studying today only", () => {
    const report = computeStreak([day("2026-10-10")], NOW);
    expect(report).toMatchObject({ current: 1, longest: 1, studiedToday: true, atRisk: false });
    expect(report.lastStudyDay).toBe("2026-10-10");
  });

  it("counts consecutive days ending today", () => {
    const report = computeStreak(run("2026-10-10", 3), NOW);
    expect(report).toMatchObject({ current: 3, longest: 3, studiedToday: true });
    expect(report.nextMilestone).toEqual({ days: 7, remaining: 4 });
  });

  it("keeps the streak alive, at risk, when the last study day was yesterday", () => {
    const report = computeStreak(run("2026-10-09", 2), NOW);
    expect(report).toMatchObject({ current: 2, studiedToday: false, atRisk: true });
  });

  it("is broken, but the longest is kept, once a whole day has been missed", () => {
    const report = computeStreak(run("2026-10-07", 3), NOW);
    expect(report).toMatchObject({ current: 0, longest: 3, atRisk: false });
    expect(report.lastStudyDay).toBe("2026-10-07");
  });

  it("restarts after a gap, and reports the longest run ever", () => {
    const days = [...run("2026-09-10", 10), ...run("2026-10-03", 3), ...run("2026-10-10", 5)];
    // Runs: 09-01..09-10 (10 days), 10-01..10-03 (3 days), 10-06..10-10 (5 days); 10-04 and 10-05 were missed.
    expect(computeStreak(days, NOW)).toMatchObject({ current: 5, longest: 10 });
  });

  it("runs across a month and year boundary", () => {
    const report = computeStreak(
      [day("2025-12-31"), day("2026-01-01"), day("2026-01-02")],
      new Date("2026-01-02T08:00:00.000Z"),
    );
    expect(report).toMatchObject({ current: 3, longest: 3 });
  });
});

describe("computeStreak: what counts as a study day", () => {
  it("needs at least 5 answered questions in the day", () => {
    const report = computeStreak([day("2026-10-09", 5), day("2026-10-10", 4)], NOW);
    expect(report).toMatchObject({ current: 1, studiedToday: false, atRisk: true });
  });

  it("adds up several entries for the same day", () => {
    expect(computeStreak([day("2026-10-10", 3), day("2026-10-10", 3)], NOW).current).toBe(1);
  });

  it("follows the configured threshold", () => {
    const report = computeStreak([day("2026-10-10", 1)], NOW, {
      ...STREAK_CONFIG,
      minQuestionsPerDay: 1,
    });
    expect(report).toMatchObject({ current: 1, minQuestionsPerDay: 1 });
  });

  it("ignores days that have not happened yet", () => {
    const report = computeStreak([day("2026-10-10"), day("2026-10-11"), day("2026-10-12")], NOW);
    expect(report).toMatchObject({ current: 1, longest: 1, lastStudyDay: "2026-10-10" });
  });
});

describe("computeStreak: recent activity and milestones", () => {
  it("counts the days studied in the last 7 and 30 days", () => {
    // ages 0, 1, 6, 7, 29, 30 days before 2026-10-10
    const days = [
      "2026-10-10",
      "2026-10-09",
      "2026-10-04",
      "2026-10-03",
      "2026-09-11",
      "2026-09-10",
    ].map((d) => day(d));
    const report = computeStreak(days, NOW);
    expect(report.daysStudiedLast7).toBe(3);
    expect(report.daysStudiedLast30).toBe(5);
  });

  it.each([
    [2, 3, 1],
    [3, 7, 4],
    [7, 14, 7],
    [29, 30, 1],
    [30, 60, 30],
    [364, 365, 1],
  ])("a streak of %i days is %i days from the next milestone by %i", (length, days, remaining) => {
    const report = computeStreak(run("2026-10-10", length), NOW);
    expect(report.current).toBe(length);
    expect(report.nextMilestone).toEqual({ days, remaining });
  });

  it("has no next milestone beyond the last one", () => {
    expect(computeStreak(run("2026-10-10", 365), NOW).nextMilestone).toBeNull();
  });
});

describe("computeStreak: determinism", () => {
  it("does not depend on the order of the days, and does not change them", () => {
    const days = Object.freeze(run("2026-10-10", 4));
    const reversed = [...days].reverse();
    expect(computeStreak(reversed, NOW)).toEqual(computeStreak(days, NOW));
  });
});
