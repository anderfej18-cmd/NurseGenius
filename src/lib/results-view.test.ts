import { describe, expect, it } from "vitest";
import {
  FILTER_LABELS,
  breakdown,
  filterCount,
  filterItems,
  reviewedNote,
  scoreText,
  statusOf,
  topicBreakdown,
  topicsToPractise,
  type ResultItem,
} from "@/lib/results-view";

const item = (
  topic: string,
  userAnswer: string | null,
  isCorrect: boolean | null,
  flagged = false,
): ResultItem => ({
  user_answer: userAnswer,
  is_correct: isCorrect,
  flagged,
  questions: { topic },
});

const items = [
  item("Pharmacology", "A", true),
  item("Pharmacology", "B", false, true),
  item("Pharmacology", null, null),
  item("Antenatal care", "C", false),
  item("Antenatal care", "D", false, true),
  item("Fundamentals", "A", true),
];

describe("statusOf", () => {
  it("calls an answer correct only when the server said so", () => {
    expect(statusOf(items[0])).toBe("correct");
    expect(statusOf(item("T", "A", null))).toBe("wrong");
    expect(statusOf(items[1])).toBe("wrong");
    expect(statusOf(items[2])).toBe("skipped");
    expect(statusOf(item("T", null, false))).toBe("skipped");
  });
});

describe("filters and counts", () => {
  it("filters by status and by flag, and keeps order", () => {
    expect(filterItems(items, "all")).toHaveLength(6);
    expect(filterItems(items, "wrong")).toHaveLength(3);
    expect(filterItems(items, "skipped")).toHaveLength(1);
    expect(filterItems(items, "flagged")).toEqual([items[1], items[4]]);
  });

  it("breaks the test down", () => {
    const counts = breakdown(items);
    expect(counts).toEqual({
      total: 6,
      attempted: 5,
      correct: 2,
      wrong: 3,
      skipped: 1,
      flagged: 2,
    });
    expect(counts.correct + counts.wrong + counts.skipped).toBe(counts.total);
  });

  it("agrees with the filters it labels", () => {
    const counts = breakdown(items);
    for (const filter of ["all", "wrong", "skipped", "flagged"] as const) {
      expect(filterCount(counts, filter)).toBe(filterItems(items, filter).length);
      expect(FILTER_LABELS[filter]).toBeTruthy();
    }
  });

  it("handles an empty test", () => {
    expect(breakdown([])).toEqual({
      total: 0,
      attempted: 0,
      correct: 0,
      wrong: 0,
      skipped: 0,
      flagged: 0,
    });
  });
});

describe("topics", () => {
  it("lists the most missed topic first, then alphabetically", () => {
    const rows = topicBreakdown(items);
    expect(rows.map((row) => row.topic)).toEqual([
      "Antenatal care",
      "Pharmacology",
      "Fundamentals",
    ]);
    expect(rows[0]).toEqual({
      topic: "Antenatal care",
      total: 2,
      correct: 0,
      wrong: 2,
      skipped: 0,
    });
    expect(rows[1]).toEqual({ topic: "Pharmacology", total: 3, correct: 1, wrong: 1, skipped: 1 });
  });

  it("suggests only topics where something was missed", () => {
    expect(topicsToPractise(items).map((row) => row.topic)).toEqual([
      "Antenatal care",
      "Pharmacology",
    ]);
    expect(topicsToPractise(items, 1)).toHaveLength(1);
    expect(topicsToPractise([item("T", "A", true)])).toEqual([]);
  });
});

describe("score and notes", () => {
  it("shows the server's score or says it is not available, never a made-up zero", () => {
    expect(scoreText(81.64)).toBe("81.6%");
    expect(scoreText(0)).toBe("0.0%");
    expect(scoreText(null)).toBe("Not available");
  });

  it("explains a gap between the test's size and what can be shown", () => {
    expect(reviewedNote(50, 50)).toBeNull();
    expect(reviewedNote(50, 49)).toBe("1 question was not shown because it was incomplete.");
    expect(reviewedNote(50, 40)).toBe("10 questions were not shown because they were incomplete.");
  });
});
