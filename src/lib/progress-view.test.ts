import { describe, expect, it } from "vitest";
import {
  challengeAction,
  examCountdown,
  masteryLevelText,
  planItemLabel,
  planItemReason,
  planAttentionText,
  planBlockSearch,
  readinessBandText,
  streakMessage,
  strongestAndWeakest,
  studyPlanStatusText,
  trendText,
} from "./progress-view";

describe("masteryLevelText and readinessBandText", () => {
  it.each([
    ["insufficient_data", "Not enough data yet"],
    ["weak", "Weak"],
    ["developing", "Developing"],
    ["proficient", "Proficient"],
    ["mastered", "Mastered"],
  ])("words the mastery level %s", (level, text) => {
    expect(masteryLevelText(level)).toBe(text);
  });

  it.each([
    ["not_enough_data", "Not enough data yet"],
    ["early", "Early days"],
    ["developing", "Developing"],
    ["solid", "Solid"],
    ["strong", "Strong"],
  ])("words the readiness band %s", (band, text) => {
    expect(readinessBandText(band)).toBe(text);
  });

  it("falls back to the raw value rather than showing nothing for a value it does not know", () => {
    expect(masteryLevelText("legendary")).toBe("legendary");
    expect(readinessBandText("elite")).toBe("elite");
  });
});

describe("streakMessage", () => {
  const base = {
    current: 0,
    longest: 0,
    studiedToday: false,
    atRisk: false,
    minQuestionsPerDay: 5,
    nextMilestone: null,
  };

  it("invites a new student to start one", () => {
    expect(streakMessage(base)).toBe("No streak yet. Answer 5 questions today to start one.");
  });

  it("tells a student with a running streak that has been kept today", () => {
    expect(streakMessage({ ...base, current: 7, studiedToday: true })).toBe(
      "7-day streak, kept for today.",
    );
  });

  it("warns when today is still to come", () => {
    expect(streakMessage({ ...base, current: 3, atRisk: true })).toBe(
      "3-day streak. Answer 5 questions today to keep it.",
    );
  });

  it("uses the singular for one day, and names the next milestone", () => {
    expect(
      streakMessage({
        ...base,
        current: 1,
        studiedToday: true,
        nextMilestone: { days: 3, remaining: 2 },
      }),
    ).toBe("1-day streak, kept for today. 2 more days to reach 3.");
  });
});

describe("challengeAction", () => {
  it.each([
    [
      { status: "not_started", examId: null },
      { label: "Start today's challenge", kind: "start" },
    ],
    [
      { status: "in_progress", examId: "e1" },
      { label: "Continue today's challenge", kind: "continue" },
    ],
    [
      { status: "completed", examId: "e1" },
      { label: "See my result", kind: "result" },
    ],
  ] as const)("offers the right action for %j", (state, expected) => {
    expect(challengeAction(state)).toEqual(expected);
  });
});

describe("examCountdown", () => {
  it.each([
    [null, "No exam date set."],
    [-3, "Your exam date has passed."],
    [0, "Your exam is today."],
    [1, "Your exam is tomorrow."],
    [45, "Your exam is in 45 days."],
  ])("words %j days to the exam", (days, text) => {
    expect(examCountdown(days)).toBe(text);
  });
});

describe("studyPlanStatusText", () => {
  it.each([
    ["not_started", "Not started"],
    ["behind", "Behind plan"],
    ["on_track", "On track"],
    ["ahead", "Ahead of plan"],
    ["finished", "Finished"],
  ])("words %s", (status, text) => {
    expect(studyPlanStatusText(status)).toBe(text);
  });
});

describe("trendText", () => {
  it.each([
    ["improving", "Improving"],
    ["declining", "Declining"],
    ["stable", "Steady"],
    ["unknown", "Not enough recent answers"],
  ])("words the trend %s", (trend, text) => {
    expect(trendText(trend)).toBe(text);
  });

  it("falls back to the raw value for one it does not know", () => {
    expect(trendText("sideways")).toBe("sideways");
  });
});

describe("planItemLabel and planItemReason", () => {
  const topic = (mastery: number | null) => ({
    kind: "topic" as const,
    topic: "Pharmacology",
    mastery,
  });

  it("names the topic, or the mock exam", () => {
    expect(planItemLabel(topic(40))).toBe("Pharmacology");
    expect(planItemLabel({ kind: "mock_exam", topic: null, mastery: null })).toBe("Mock exam");
  });

  it("explains a topic below the target by the measured gap", () => {
    expect(planItemReason(topic(38.5), 80)).toBe(
      "Pharmacology is at 38.5% mastery against your target of 80%.",
    );
  });

  it("explains a topic already at the target as upkeep", () => {
    expect(planItemReason(topic(84), 80)).toBe(
      "Pharmacology is at 84% mastery, above your target of 80%; practice keeps it there.",
    );
  });

  it("explains a topic never practised as building a baseline, with no invented figure", () => {
    expect(planItemReason(topic(null), 80)).toBe(
      "You have not practised Pharmacology yet, so this builds a first measure of it.",
    );
  });

  it("explains a final-week review and the mock exam", () => {
    expect(planItemReason({ kind: "review", topic: "Pharmacology", mastery: 38.5 }, 80)).toBe(
      "Final-week review: Pharmacology is at 38.5% mastery, one of your furthest from the target.",
    );
    expect(planItemReason({ kind: "review", topic: "Pharmacology", mastery: null }, 80)).toBe(
      "Final-week review of Pharmacology.",
    );
    expect(planItemReason({ kind: "mock_exam", topic: null, mastery: null }, 80)).toBe(
      "A timed mock exam to practise under exam conditions.",
    );
  });
});

describe("planAttentionText", () => {
  it("says why the plan should be updated, or nothing", () => {
    expect(planAttentionText("exam_date_changed")).toMatch(/exam date has changed/i);
    expect(planAttentionText("behind")).toMatch(/behind/i);
    expect(planAttentionText(null)).toBeNull();
  });
});

describe("planBlockSearch", () => {
  it("opens the exam screen already set for what the block asks for", () => {
    expect(planBlockSearch({ kind: "due_reviews" })).toEqual({ selection: "due" });
    expect(planBlockSearch({ kind: "mistake_review" })).toEqual({ selection: "mistakes" });
    expect(planBlockSearch({ kind: "topic_practice", topic: "Pharmacology" })).toEqual({
      topic: "Pharmacology",
      selection: "adaptive",
    });
    expect(planBlockSearch({ kind: "mixed_practice" })).toEqual({ selection: "adaptive" });
    expect(planBlockSearch({ kind: "speed_practice" })).toEqual({ selection: "adaptive" });
  });
});

describe("strongestAndWeakest", () => {
  const topic = (name: string, score: number, level: string) => ({ topic: name, score, level });

  it("takes the server's levels as they are: proficient and mastered are strengths, weak and developing need work", () => {
    const { strongest, weakest } = strongestAndWeakest([
      topic("Pharmacology", 30, "weak"),
      topic("Anatomy", 55, "developing"),
      topic("Ethics", 72, "proficient"),
      topic("Paediatrics", 91, "mastered"),
    ]);
    expect(strongest.map((t) => t.topic)).toEqual(["Paediatrics", "Ethics"]);
    expect(weakest.map((t) => t.topic)).toEqual(["Pharmacology", "Anatomy"]);
  });

  it("leaves out topics without enough data, rather than calling them weak", () => {
    const { strongest, weakest } = strongestAndWeakest([
      topic("New topic", 50, "insufficient_data"),
    ]);
    expect(strongest).toEqual([]);
    expect(weakest).toEqual([]);
  });

  it("never puts a topic in both lists and shows at most the requested number", () => {
    const topics = Array.from({ length: 8 }, (_, i) =>
      topic(`T${i}`, i * 12, i < 4 ? "weak" : "mastered"),
    );
    const { strongest, weakest } = strongestAndWeakest(topics, 3);
    expect(strongest).toHaveLength(3);
    expect(weakest).toHaveLength(3);
    expect(strongest.some((s) => weakest.some((w) => w.topic === s.topic))).toBe(false);
    expect(weakest.map((t) => t.score)).toEqual([0, 12, 24]);
    expect(strongest.map((t) => t.score)).toEqual([84, 72, 60]);
  });

  it("gives nothing for no topics", () => {
    expect(strongestAndWeakest([])).toEqual({ strongest: [], weakest: [] });
  });
});
