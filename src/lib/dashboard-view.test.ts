import { describe, expect, it } from "vitest";
import {
  allowanceCaption,
  allowanceHeadline,
  greetingTitle,
  scoreTrend,
  streakHeadline,
  trendAxisLabels,
} from "./dashboard-view";

const exam = (scorePct: number | null, scoreVerified: boolean, day: number) => ({
  category: "Pharmacology",
  examType: "RN",
  completedAt: `2026-10-${String(day).padStart(2, "0")}T10:00:00Z`,
  scorePct,
  scoreVerified,
});

describe("dashboard wording", () => {
  it("greets by name, and plainly when there is none", () => {
    expect(greetingTitle("Ada")).toBe("Welcome back, Ada");
    expect(greetingTitle("  ")).toBe("Welcome back");
    expect(greetingTitle(null)).toBe("Welcome back");
  });

  it("orders the score trend oldest first and leaves out unverified scores", () => {
    const newestFirst = [
      exam(70, true, 9),
      exam(55, false, 8),
      exam(40, true, 7),
      exam(null, true, 6),
    ];
    const trend = scoreTrend(newestFirst);
    expect(trend.map((point) => point.value)).toEqual([40, 70]);
    expect(trend[0].label).toContain("RN Pharmacology");
    expect(trendAxisLabels(newestFirst)).toEqual({ first: "7 Oct", last: "9 Oct" });
    expect(trendAxisLabels([])).toEqual({ first: "", last: "" });
  });

  it("describes the daily allowance with and without a limit", () => {
    expect(allowanceHeadline(12, 50)).toBe("12 of 50");
    expect(allowanceHeadline(12, null)).toBe("12 today");
    expect(allowanceCaption(49, 50)).toBe("1 question left today.");
    expect(allowanceCaption(10, 50)).toBe("40 questions left today.");
    expect(allowanceCaption(50, 50)).toContain("reset tomorrow");
    expect(allowanceCaption(70, null)).toBe("Your plan has no daily limit.");
  });

  it("pluralises the streak", () => {
    expect(streakHeadline(1)).toBe("1 day");
    expect(streakHeadline(0)).toBe("0 days");
    expect(streakHeadline(12)).toBe("12 days");
  });
});
