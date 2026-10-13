import { describe, expect, it } from "vitest";
import {
  MAX_SESSION_MINUTES,
  MIN_SESSION_MINUTES,
  TIER_DAILY_LIMIT,
  TIER_SESSION_LIMIT,
} from "@/lib/exam-rules";
import {
  MINUTES_RANGE,
  allowanceFor,
  allowanceNote,
  clampCount,
  countRange,
  defaultCount,
  filterTopics,
  pacingNote,
  programmeSummary,
  programmeSummaryText,
  secondsPerQuestion,
  sessionLimitFor,
  suggestedMinutes,
} from "@/lib/start-flow";

describe("question and time bounds", () => {
  it("takes the minutes range from the shared rules the server enforces", () => {
    expect(MINUTES_RANGE).toEqual({ min: MIN_SESSION_MINUTES, max: MAX_SESSION_MINUTES });
  });

  it("offers up to each plan's largest test", () => {
    for (const tier of ["novice", "erudite", "scholar"] as const) {
      expect(sessionLimitFor(tier)).toBe(TIER_SESSION_LIMIT[tier]);
      expect(countRange(sessionLimitFor(tier)).max).toBe(TIER_SESSION_LIMIT[tier]);
    }
  });

  it("starts from 50 questions, or the plan's limit if that is smaller", () => {
    expect(defaultCount(250)).toBe(50);
    expect(defaultCount(50)).toBe(50);
    expect(defaultCount(30)).toBe(30);
  });

  it("keeps a chosen count inside the range", () => {
    expect(clampCount(500, 50)).toBe(50);
    expect(clampCount(0, 50)).toBe(10);
    expect(clampCount(33.4, 150)).toBe(33);
    expect(countRange(7)).toEqual({ min: 7, max: 7 });
    expect(countRange(0)).toEqual({ min: 1, max: 1 });
  });

  it("suggests about 72 seconds a question in whole five-minute steps within the range", () => {
    expect(suggestedMinutes(50)).toBe(60);
    expect(suggestedMinutes(10)).toBe(15);
    expect(suggestedMinutes(1)).toBe(MIN_SESSION_MINUTES);
    expect(suggestedMinutes(1000)).toBe(MAX_SESSION_MINUTES);
    for (const count of [10, 20, 30, 50, 100, 150, 250]) {
      expect(suggestedMinutes(count) % 5).toBe(0);
    }
  });
});

describe("pacing advice", () => {
  it("measures seconds per question", () => {
    expect(secondsPerQuestion(60, 60)).toBe(60);
    expect(secondsPerQuestion(0, 60)).toBe(3600);
  });

  it("is silent for a normal pace and speaks only at the extremes", () => {
    expect(pacingNote(50, 60)).toBeNull();
    expect(pacingNote(100, 20)).toMatch(/12 seconds a question/);
    expect(pacingNote(10, 180)).toMatch(/minutes a question/);
  });
});

describe("today's allowance", () => {
  const now = new Date("2026-10-11T09:00:00Z");
  const profile = (over: Partial<Parameters<typeof allowanceFor>[0]>) => ({
    tier: "novice" as const,
    questions_today: 0,
    last_question_date: null,
    ...over,
  });

  it("counts only today's use", () => {
    expect(
      allowanceFor(profile({ questions_today: 30, last_question_date: "2026-10-11" }), now),
    ).toEqual({
      limit: TIER_DAILY_LIMIT.novice,
      used: 30,
      remaining: 20,
    });
    expect(
      allowanceFor(profile({ questions_today: 30, last_question_date: "2026-10-10" }), now).used,
    ).toBe(0);
  });

  it("has no limit on the unlimited plan", () => {
    const scholar = allowanceFor(
      profile({ tier: "scholar", questions_today: 900, last_question_date: "2026-10-11" }),
      now,
    );
    expect(scholar).toEqual({ limit: null, used: 900, remaining: null });
    expect(allowanceNote(scholar, 250)).toBeNull();
  });

  it("never reports less than zero left", () => {
    expect(
      allowanceFor(profile({ questions_today: 80, last_question_date: "2026-10-11" }), now)
        .remaining,
    ).toBe(0);
  });

  it("warns when nothing is left, or when the test is bigger than what is left", () => {
    const none = allowanceFor(
      profile({ questions_today: 50, last_question_date: "2026-10-11" }),
      now,
    );
    expect(allowanceNote(none, 10)?.tone).toBe("warning");
    const some = allowanceFor(
      profile({ questions_today: 30, last_question_date: "2026-10-11" }),
      now,
    );
    expect(allowanceNote(some, 30)?.text).toContain("20 questions left");
    expect(allowanceNote(some, 20)).toBeNull();
  });
});

describe("topics", () => {
  const counts = { Pharmacology: 120, "Antenatal care": 80, Empty: 0, "Mental health": 45 };

  it("lists non-empty topics alphabetically", () => {
    expect(filterTopics(counts, "").map((t) => t.topic)).toEqual([
      "Antenatal care",
      "Mental health",
      "Pharmacology",
    ]);
  });

  it("filters by what was typed, ignoring case and spaces at the ends", () => {
    expect(filterTopics(counts, "  ANTE ").map((t) => t.topic)).toEqual(["Antenatal care"]);
    expect(filterTopics(counts, "zzz")).toEqual([]);
  });

  it("summarises a programme from the server's counts", () => {
    expect(programmeSummary(counts)).toEqual({ topics: 3, questions: 245 });
    expect(programmeSummaryText(counts)).toBe("3 topics, 245 questions");
    expect(programmeSummaryText({ One: 1 })).toBe("1 topic, 1 question");
    expect(programmeSummaryText({})).toBe("0 topics, 0 questions");
  });
});
