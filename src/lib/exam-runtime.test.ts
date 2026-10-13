import { describe, expect, it } from "vitest";
import {
  SUBMIT_UNLOCK_SHARE,
  answersNeededToSubmit,
  clockFace,
  countItems,
  elapsedShare,
  milestoneCrossed,
  milestoneText,
  navigatorLabel,
  optionForKey,
  remainingSeconds,
  submitLockedText,
  submitSummaryText,
  submitUnlocked,
} from "@/lib/exam-runtime";

const started = "2026-10-11T10:00:00.000Z";
const at = (seconds: number) => new Date(started).getTime() + seconds * 1000;

describe("the clock", () => {
  it("counts down to the deadline and stops at zero", () => {
    const deadline = "2026-10-11T11:00:00.000Z";
    expect(remainingSeconds(deadline, at(0))).toBe(3600);
    expect(remainingSeconds(deadline, at(3599))).toBe(1);
    expect(remainingSeconds(deadline, at(3599.4))).toBe(0);
    expect(remainingSeconds(deadline, at(4000))).toBe(0);
  });

  it("shows two digits for minutes and seconds", () => {
    expect(clockFace(3599)).toEqual({ minutes: "59", seconds: "59" });
    expect(clockFace(65)).toEqual({ minutes: "01", seconds: "05" });
    expect(clockFace(0)).toEqual({ minutes: "00", seconds: "00" });
    expect(clockFace(-5)).toEqual({ minutes: "00", seconds: "00" });
    expect(clockFace(6000)).toEqual({ minutes: "100", seconds: "00" });
  });

  it("measures the share of the limit that has passed", () => {
    expect(elapsedShare(started, 60, at(1800))).toBeCloseTo(0.5);
    expect(elapsedShare(started, 0, at(1800))).toBe(0);
  });
});

describe("when Submit unlocks (a screen rule, 80% of answers or 80% of the time)", () => {
  const base = { total: 50, startedAt: started, limitMinutes: 60 };

  it("is locked early with few answers", () => {
    expect(submitUnlocked({ ...base, answered: 10, nowMs: at(600) })).toBe(false);
  });

  it("unlocks at 80% answered", () => {
    expect(submitUnlocked({ ...base, answered: 39, nowMs: at(600) })).toBe(false);
    expect(submitUnlocked({ ...base, answered: 40, nowMs: at(600) })).toBe(true);
  });

  it("unlocks at 80% of the time even with nothing answered", () => {
    expect(submitUnlocked({ ...base, answered: 0, nowMs: at(60 * 60 * 0.8 - 1) })).toBe(false);
    expect(submitUnlocked({ ...base, answered: 0, nowMs: at(60 * 60 * 0.8) })).toBe(true);
  });

  it("never unlocks on an empty test by answers alone", () => {
    expect(submitUnlocked({ ...base, total: 0, answered: 0, nowMs: at(0) })).toBe(false);
  });

  it("states the rule in words that match the number", () => {
    expect(SUBMIT_UNLOCK_SHARE).toBe(0.8);
    expect(answersNeededToSubmit(50)).toBe(40);
    expect(answersNeededToSubmit(33)).toBe(27);
    expect(submitLockedText(50)).toContain("40 questions");
    expect(submitLockedText(50)).toContain("80% of the time");
  });
});

describe("counts and the navigator", () => {
  const items = [
    { answered: true, flagged: false },
    { answered: false, flagged: true },
    { answered: true, flagged: true },
    { answered: false, flagged: false },
  ];

  it("counts what was answered, left open and flagged", () => {
    expect(countItems(items)).toEqual({ total: 4, answered: 2, unanswered: 2, flagged: 2 });
    expect(countItems([])).toEqual({ total: 0, answered: 0, unanswered: 0, flagged: 0 });
  });

  it("labels each cell with its state for screen readers", () => {
    expect(navigatorLabel(0, items[0], true)).toBe("Question 1, answered, current");
    expect(navigatorLabel(1, items[1], false)).toBe("Question 2, not answered, flagged");
    expect(navigatorLabel(2, items[2], false)).toBe("Question 3, answered, flagged");
  });
});

describe("warnings and shortcuts", () => {
  it("announces each milestone once, as the clock crosses it", () => {
    expect(milestoneCrossed(601, 600)).toBe(600);
    expect(milestoneCrossed(600, 599)).toBeNull();
    expect(milestoneCrossed(301, 299)).toBe(300);
    expect(milestoneCrossed(61, 60)).toBe(60);
    expect(milestoneCrossed(10, 9)).toBeNull();
    expect(milestoneText(600)).toBe("10 minutes left.");
    expect(milestoneText(300)).toBe("5 minutes left.");
    expect(milestoneText(60)).toBe("One minute left.");
  });

  it("maps letter keys to options in either case and ignores everything else", () => {
    expect(optionForKey("a")).toBe("A");
    expect(optionForKey("D")).toBe("D");
    for (const key of ["e", "1", "Enter", "ArrowRight", " ", "AA", ""]) {
      expect(optionForKey(key)).toBeNull();
    }
  });

  it("summarises what is still open before submitting", () => {
    expect(submitSummaryText({ total: 10, answered: 10, unanswered: 0, flagged: 0 })).toBe(
      "You have answered 10 of 10.",
    );
    expect(submitSummaryText({ total: 10, answered: 8, unanswered: 2, flagged: 1 })).toBe(
      "You have answered 8 of 10. 2 questions are not answered and 1 question is flagged.",
    );
    expect(submitSummaryText({ total: 10, answered: 9, unanswered: 1, flagged: 0 })).toContain(
      "1 question is not answered",
    );
  });
});
