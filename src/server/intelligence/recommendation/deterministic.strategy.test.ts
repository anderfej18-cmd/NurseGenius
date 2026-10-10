import { describe, expect, it } from "vitest";
import type { MasteryLevel, MasteryTrend, TopicMastery } from "../mastery/mastery.service";
import { DeterministicRecommendationStrategy } from "./deterministic.strategy";
import type {
  PlanBlock,
  RecommendationInput,
  RecommendationStrategy,
} from "./recommendation.types";

const NOW = new Date("2026-10-10T09:00:00.000Z");

function topic(
  name: string,
  score: number,
  trend: MasteryTrend = "stable",
  level: MasteryLevel = "developing",
): TopicMastery {
  return {
    topic: name,
    attempts: 30,
    score,
    rawScore: score / 100,
    evidence: 0.75,
    level,
    trend,
    components: {
      accuracy: 0.5,
      recency: 0.5,
      consistency: null,
      difficulty: null,
      calibration: null,
    },
    componentsUsed: ["accuracy", "recency"],
    penalties: { repeatedMistakes: 0 },
  };
}

const input = (overrides: Partial<RecommendationInput> = {}): RecommendationInput => ({
  now: NOW,
  availableMinutes: 30,
  topics: [],
  dueReviews: 0,
  unresolvedMistakes: 0,
  activity: { activeDaysLast7: 3, daysSinceLastStudy: 0 },
  exam: { date: null, daysToExam: null },
  pace: { averageSecondsPerQuestion: null, slowButAccurate: false },
  remainingToday: null,
  ...overrides,
});

const ORGANIC = topic("Organic Chemistry", 42);
const STOICH = topic("Stoichiometry", 55);
const ATOMIC = topic("Atomic Structure", 87);

const strategy: RecommendationStrategy = new DeterministicRecommendationStrategy();
const plan = (overrides: Partial<RecommendationInput> = {}) => strategy.recommend(input(overrides));
const summary = (blocks: readonly PlanBlock[]) =>
  blocks.map((b) => [b.kind === "topic_practice" ? b.topic : b.kind, b.questions]);

describe("DeterministicRecommendationStrategy: a normal day", () => {
  it("answers what to study today from weak topics, mistakes and due reviews", () => {
    const result = plan({
      topics: [ATOMIC, STOICH, ORGANIC],
      dueReviews: 12,
      unresolvedMistakes: 8,
    });
    // budget 30; non-topic 18: reviews round(30*0.3) = 9, mistakes round(30*0.2) = 6; topics get 15,
    // split by weakness 0.58 : 0.45 -> 8.45 : 6.55 -> 8 + 7 (the spare place goes to the larger remainder)
    expect(summary(result.blocks)).toEqual([
      ["due_reviews", 9],
      ["mistake_review", 6],
      ["Organic Chemistry", 8],
      ["Stoichiometry", 7],
    ]);
    expect(result).toMatchObject({
      date: "2026-10-10",
      totalQuestions: 30,
      estimatedMinutes: 30,
      urgency: "none",
      limitReached: false,
    });
  });

  it("never plans a topic the student has already mastered while weaker ones exist", () => {
    const mastered = topic("Atomic Structure", 87, "stable", "mastered");
    const result = plan({ topics: [mastered, ORGANIC] });
    expect(result.blocks.map((b) => (b.kind === "topic_practice" ? b.topic : b.kind))).toEqual([
      "Organic Chemistry",
    ]);
  });

  it("falls back to the mastered topics when they are all the student has", () => {
    const mastered = topic("Atomic Structure", 90, "stable", "mastered");
    const result = plan({ topics: [mastered] });
    expect(result.blocks.map((b) => (b.kind === "topic_practice" ? b.topic : b.kind))).toEqual([
      "Atomic Structure",
    ]);
  });

  it("still splits the day when every topic is at 100% and no weakness separates them", () => {
    const a = topic("Atomic Structure", 100, "stable", "mastered");
    const b = topic("Organic Chemistry", 100, "stable", "mastered");
    const result = plan({ topics: [a, b] });
    expect(result.blocks.map((block) => block.questions)).toEqual([15, 15]);
    expect(result.totalQuestions).toBe(30);
  });

  it("explains each block and names the mastery behind a topic", () => {
    const [topicBlock] = plan({ topics: [ORGANIC] }).blocks;
    expect(topicBlock).toMatchObject({
      kind: "topic_practice",
      topic: "Organic Chemistry",
      mastery: 42,
      title: "Organic Chemistry",
    });
    expect(topicBlock.reason).toMatch(/weakest.*42/i);
  });

  it("starts with mixed practice for a student with no history", () => {
    const result = plan();
    expect(summary(result.blocks)).toEqual([["mixed_practice", 30]]);
  });

  it("puts a topic whose accuracy is falling ahead of a slightly weaker one that is steady", () => {
    const falling = topic("Falling", 50, "declining");
    const steady = topic("Steady", 45);
    const first = plan({ topics: [steady, falling] }).blocks[0];
    expect(first).toMatchObject({ kind: "topic_practice", topic: "Falling" });
  });
});

describe("DeterministicRecommendationStrategy: sizing the day", () => {
  it("fits the plan to the time available at the student's own pace", () => {
    expect(plan({ availableMinutes: 30 }).totalQuestions).toBe(30); // 60 seconds each when pace is unknown
    expect(
      plan({
        availableMinutes: 30,
        pace: { averageSecondsPerQuestion: 30, slowButAccurate: false },
      }).totalQuestions,
    ).toBe(60);
  });

  it("keeps the plan between 10 and 100 questions, and the assumed pace between 15 and 300 seconds", () => {
    expect(plan({ availableMinutes: 5 }).totalQuestions).toBe(10);
    expect(plan({ availableMinutes: 240 }).totalQuestions).toBe(100);
    expect(
      plan({ availableMinutes: 30, pace: { averageSecondsPerQuestion: 5, slowButAccurate: false } })
        .totalQuestions,
    ).toBe(100); // 5 s clamps to 15 s: 120 -> 100
    expect(
      plan({
        availableMinutes: 30,
        pace: { averageSecondsPerQuestion: 1000, slowButAccurate: false },
      }).totalQuestions,
    ).toBe(10); // 1000 s clamps to 300 s: 6 -> 10
  });

  it("estimates the minutes from the questions and the pace", () => {
    const result = plan({
      availableMinutes: 30,
      pace: { averageSecondsPerQuestion: 45, slowButAccurate: false },
    });
    expect(result.estimatedMinutes).toBe(Math.ceil((result.totalQuestions * 45) / 60));
  });

  it("never plans more than the student may still start today", () => {
    const result = plan({
      topics: [ORGANIC, STOICH],
      dueReviews: 12,
      unresolvedMistakes: 8,
      remainingToday: 20,
    });
    // budget 20; non-topic 12: reviews 6, mistakes 5 (the smallest block); topics get 9 -> one topic
    expect(summary(result.blocks)).toEqual([
      ["due_reviews", 6],
      ["mistake_review", 5],
      ["Organic Chemistry", 9],
    ]);
    expect(result.totalQuestions).toBe(20);
  });

  it("returns an empty plan, and says why, when today's allowance is used up", () => {
    const result = plan({ topics: [ORGANIC], dueReviews: 4, remainingToday: 0 });
    expect(result).toMatchObject({
      limitReached: true,
      totalQuestions: 0,
      estimatedMinutes: 0,
      blocks: [],
    });
    expect(result.notes.join(" ")).toMatch(/limit/i);
  });

  it("keeps the blocks that fit when time is short, and drops those that would be too small", () => {
    // budget 10; non-topic 6: reviews max(3, 5) = 5 leaves 1, too few for the 5-question mistake block
    const result = plan({
      availableMinutes: 5,
      topics: [ORGANIC, STOICH],
      dueReviews: 12,
      unresolvedMistakes: 8,
    });
    expect(summary(result.blocks)).toEqual([
      ["due_reviews", 5],
      ["Organic Chemistry", 5],
    ]);
    expect(result.totalQuestions).toBe(10);
  });

  it("plans only the questions that exist: a handful of due reviews make a small block", () => {
    const result = plan({ topics: [ORGANIC], dueReviews: 3 });
    expect(result.blocks[0]).toMatchObject({ kind: "due_reviews", questions: 3 });
  });

  it("never gives a topic fewer than the minimum, even beside a far weaker one", () => {
    const veryWeak = topic("Very Weak", 5);
    const nearlyStrong = topic("Nearly Strong", 95);
    const blocks = plan({ topics: [veryWeak, nearlyStrong] }).blocks.filter(
      (b) => b.kind === "topic_practice",
    );
    // 30 in all. By weakness alone the split is 28.5 : 1.5. With the minimum first: 5 + 5, then the other 20 by weakness (19 : 1)
    expect(blocks.map((b) => b.questions)).toEqual([24, 6]);
    expect(Math.min(...blocks.map((b) => b.questions))).toBeGreaterThanOrEqual(5);
  });

  it("leaves out blocks that have nothing to work on", () => {
    const kinds = plan({ topics: [ORGANIC], dueReviews: 0, unresolvedMistakes: 0 }).blocks.map(
      (b) => b.kind,
    );
    expect(kinds).toEqual(["topic_practice"]);
  });

  it("adds speed practice only for a student who is accurate but slow", () => {
    const slow = plan({
      topics: [ORGANIC],
      pace: { averageSecondsPerQuestion: 90, slowButAccurate: true },
    });
    expect(slow.blocks.at(-1)).toMatchObject({ kind: "speed_practice", questions: 5 }); // round(30 * 0.1) = 3, raised to the 5-question minimum
    expect(plan({ topics: [ORGANIC] }).blocks.some((b) => b.kind === "speed_practice")).toBe(false);
  });

  it("always adds up: the blocks total the plan", () => {
    const result = plan({
      topics: [ORGANIC, STOICH, ATOMIC],
      dueReviews: 40,
      unresolvedMistakes: 40,
      availableMinutes: 90,
      pace: { averageSecondsPerQuestion: 60, slowButAccurate: true },
    });
    expect(result.blocks.reduce((sum, b) => sum + b.questions, 0)).toBe(result.totalQuestions);
    expect(result.totalQuestions).toBeLessThanOrEqual(90);
  });
});

describe("DeterministicRecommendationStrategy: the exam date", () => {
  const urgencyAt = (daysToExam: number | null) =>
    plan({ exam: { date: daysToExam === null ? null : "2026-12-01", daysToExam } }).urgency;

  it.each([
    [null, "none"],
    [-3, "none"],
    [0, "high"],
    [14, "high"],
    [15, "medium"],
    [30, "medium"],
    [31, "low"],
    [60, "low"],
    [61, "none"],
  ] as const)("treats %s days to the exam as %s urgency", (days, expected) => {
    expect(urgencyAt(days)).toBe(expected);
  });

  it("spreads practice over more topics as the exam nears", () => {
    const base = { topics: [ORGANIC, STOICH, topic("Ethics", 60)], availableMinutes: 60 };
    const calm = plan({ ...base }).blocks.filter((b) => b.kind === "topic_practice");
    const urgent = plan({ ...base, exam: { date: "2026-10-20", daysToExam: 10 } }).blocks.filter(
      (b) => b.kind === "topic_practice",
    );
    expect(calm).toHaveLength(2);
    expect(urgent).toHaveLength(3);
  });

  it("mentions the exam, and a long absence, in the notes", () => {
    const result = plan({
      topics: [ORGANIC],
      exam: { date: "2026-10-20", daysToExam: 10 },
      activity: { activeDaysLast7: 0, daysSinceLastStudy: 5 },
    });
    const notes = result.notes.join(" ");
    expect(notes).toMatch(/10 days/);
    expect(notes).toMatch(/5 days/);
  });

  it("does not mention an absence for a student who studied recently, or never has", () => {
    expect(plan({ activity: { activeDaysLast7: 5, daysSinceLastStudy: 1 } }).notes).toEqual([]);
    expect(plan({ activity: { activeDaysLast7: 0, daysSinceLastStudy: null } }).notes).toEqual([]);
  });
});

describe("DeterministicRecommendationStrategy: determinism", () => {
  it("gives the same plan for the same picture, however the topics are ordered, and changes nothing", () => {
    const topics = Object.freeze([ATOMIC, ORGANIC, STOICH]);
    const frozen = input({
      topics: topics as TopicMastery[],
      dueReviews: 7,
      unresolvedMistakes: 3,
    });
    expect(strategy.recommend(frozen)).toEqual(
      strategy.recommend({ ...frozen, topics: [...topics].reverse() }),
    );
    expect(topics).toHaveLength(3);
  });

  it("breaks equal priorities alphabetically", () => {
    const first = plan({ topics: [topic("B", 50), topic("A", 50)] }).blocks[0];
    expect(first).toMatchObject({ topic: "A" });
  });
});
