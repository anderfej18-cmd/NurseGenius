import { describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/app-errors";
import { type PlanInput, type PlanTopic, generateStudyPlan } from "./study-plan";

const topic = (name: string, questionCount: number, mastery: number | null): PlanTopic => ({
  topic: name,
  questionCount,
  mastery,
});
const A = topic("A", 100, 40);
const B = topic("B", 100, 80);
const C = topic("C", 100, null); // never practised: treated as mastery 50

const input = (overrides: Partial<PlanInput> = {}): PlanInput => ({
  today: "2026-10-01",
  examDate: "2026-10-29",
  dailyMinutes: 30,
  daysPerWeek: 5,
  targetScore: 80,
  secondsPerQuestion: null,
  topics: [A, B, C],
  ...overrides,
});
const summary = (plan: ReturnType<typeof generateStudyPlan>) =>
  plan.weeks.map((week) => [
    week.index,
    week.startsOn,
    week.endsOn,
    week.kind,
    week.questionBudget,
  ]);
const items = (plan: ReturnType<typeof generateStudyPlan>, week: number) =>
  plan.weeks[week].items.map((item) => [item.kind, item.topic, item.questions]);

describe("generateStudyPlan: a four-week plan", () => {
  // 28 days to study (10-01 to 10-28), 30 minutes at 60 s a question = 30 a day, 5 days a week = 150 a week.
  const plan = generateStudyPlan(input());

  it("covers every day from today to the day before the exam, one week at a time", () => {
    expect(summary(plan)).toEqual([
      [0, "2026-10-01", "2026-10-07", "learn", 150],
      [1, "2026-10-08", "2026-10-14", "learn", 150],
      [2, "2026-10-15", "2026-10-21", "learn", 150],
      [3, "2026-10-22", "2026-10-28", "final", 150],
    ]);
    expect(plan).toMatchObject({
      startsOn: "2026-10-01",
      examDate: "2026-10-29",
      questionsPerDay: 30,
    });
  });

  it("weights topics by how far below the target they are, and caps each at two passes of the bank", () => {
    // Weights: A .25+.40 = .65, B .25+0, C .25+.30 = .55 (sum 1.45) over 450 learn questions:
    // A 202, B 77, C 171 → A is capped at 2 × 100 = 200, leaving 2 unallocated.
    expect(plan.summary.learnQuestions).toBe(448);
    expect(plan.summary.unallocatedQuestions).toBe(2);
  });

  it("lays the topics out weakest-first across the learn weeks", () => {
    expect(items(plan, 0)).toEqual([["topic", "A", 150]]);
    expect(items(plan, 1)).toEqual([
      ["topic", "A", 50],
      ["topic", "C", 100],
    ]);
    expect(items(plan, 2)).toEqual([
      ["topic", "C", 71],
      ["topic", "B", 77],
    ]);
  });

  it("spends the last week on reviewing the topics still below target, then a mock exam", () => {
    // 60% of 150 = 90 for review, split by weight .65 : .55 → 49 and 41; mock exam min(50, 60) = 50.
    expect(items(plan, 3)).toEqual([
      ["review", "A", 49],
      ["review", "C", 41],
      ["mock_exam", null, 50],
    ]);
    expect(plan.summary.totalQuestions).toBe(448 + 49 + 41 + 50);
  });

  it("never plans more in a week than the week allows", () => {
    for (const week of plan.weeks) {
      const planned = week.items.reduce((sum, item) => sum + item.questions, 0);
      expect(planned).toBeLessThanOrEqual(week.questionBudget);
    }
  });

  it("numbers each item by week and position", () => {
    expect(plan.weeks[1].items.map((item) => item.weekIndex)).toEqual([1, 1]);
  });
});

describe("generateStudyPlan: short runs", () => {
  it("makes a single final week when the exam is within a week", () => {
    // 4 study days (10-01 to 10-04) × 30 = 120: review 72 (A 39, C 33), mock exam min(50, 48) = 48.
    const plan = generateStudyPlan(input({ examDate: "2026-10-05" }));
    expect(summary(plan)).toEqual([[0, "2026-10-01", "2026-10-04", "final", 120]]);
    expect(items(plan, 0)).toEqual([
      ["review", "A", 39],
      ["review", "C", 33],
      ["mock_exam", null, 48],
    ]);
    expect(plan.summary.learnQuestions).toBe(0);
  });

  it("plans a single day when the exam is tomorrow", () => {
    const plan = generateStudyPlan(input({ examDate: "2026-10-02" }));
    expect(summary(plan)).toEqual([[0, "2026-10-01", "2026-10-01", "final", 30]]);
  });

  it("rounds the review share down, leaving the rest to the mock exam", () => {
    // 11 questions in the one day: 60% is 6.6, so 6 for review (A 3, C 3) and 5 for the mock exam.
    const plan = generateStudyPlan(input({ examDate: "2026-10-02", dailyMinutes: 11 }));
    expect(items(plan, 0)).toEqual([
      ["review", "A", 3],
      ["review", "C", 3],
      ["mock_exam", null, 5],
    ]);
  });

  it("shortens the last week when the days do not fill it", () => {
    // 10 days: a full week of 150, then 3 days of 90 as the final week.
    const plan = generateStudyPlan(input({ examDate: "2026-10-11" }));
    expect(summary(plan)).toEqual([
      [0, "2026-10-01", "2026-10-07", "learn", 150],
      [1, "2026-10-08", "2026-10-10", "final", 90],
    ]);
  });

  it("studies fewer days than asked in a week that has fewer days", () => {
    const plan = generateStudyPlan(input({ examDate: "2026-10-04", daysPerWeek: 5 }));
    expect(plan.weeks[0].questionBudget).toBe(90); // 3 days, not 5
  });
});

describe("generateStudyPlan: the student's pace and time", () => {
  it("uses the student's own seconds per question, within bounds", () => {
    expect(generateStudyPlan(input({ secondsPerQuestion: 30 })).questionsPerDay).toBe(60);
    expect(generateStudyPlan(input({ secondsPerQuestion: 5 })).questionsPerDay).toBe(120); // clamped to 15 s
    expect(generateStudyPlan(input({ secondsPerQuestion: 1000 })).questionsPerDay).toBe(6); // clamped to 300 s
  });

  it("plans at least one question a day", () => {
    const plan = generateStudyPlan(input({ dailyMinutes: 10, secondsPerQuestion: 300 }));
    expect(plan.questionsPerDay).toBe(2);
  });

  it("gives topics nothing when the time is too short to reach them, and says which", () => {
    // 1 study day a week at 10 minutes = 10 a week; one learn week of 10 over 12 equal topics.
    const many = Array.from({ length: 12 }, (_, i) =>
      topic(`T${String(i).padStart(2, "0")}`, 50, null),
    );
    const plan = generateStudyPlan(
      input({ examDate: "2026-10-12", dailyMinutes: 10, daysPerWeek: 1, topics: many }),
    );
    expect(plan.summary.learnQuestions).toBe(10);
    expect(plan.summary.unscheduledTopics).toEqual(["T10", "T11"]);
  });
});

describe("generateStudyPlan: the target score", () => {
  it("gives topics already at the target only the base weight", () => {
    const strong = [topic("X", 100, 90), topic("Y", 100, 95)];
    const plan = generateStudyPlan(input({ topics: strong }));
    // Equal weights give 225 each, but a topic takes at most two passes of its 100 questions: 400 in all.
    // The review week takes the two lowest topics even though both are above the target.
    expect(plan.summary.learnQuestions).toBe(400);
    expect(plan.summary.unallocatedQuestions).toBe(50);
    expect(items(plan, 3).map(([kind, name]) => [kind, name])).toEqual([
      ["review", "X"],
      ["review", "Y"],
      ["mock_exam", null],
    ]);
  });

  it("gives a topic more of the plan the higher the target", () => {
    const topicTotal = (plan: ReturnType<typeof generateStudyPlan>, name: string) =>
      plan.weeks
        .flatMap((week) => week.items)
        .filter((item) => item.kind === "topic" && item.topic === name)
        .reduce((sum, item) => sum + item.questions, 0);
    // Target 50: weights A .35, B .25, C .25 → B gets 133 of 450. Target 100: A .85, B .45, C .75 → B gets 99.
    expect(topicTotal(generateStudyPlan(input({ targetScore: 50 })), "B")).toBe(133);
    expect(topicTotal(generateStudyPlan(input({ targetScore: 100 })), "B")).toBe(99);
  });
});

describe("generateStudyPlan: refusing what cannot be planned", () => {
  it.each([
    ["an exam that is today", { examDate: "2026-10-01" }],
    ["an exam in the past", { examDate: "2026-09-01" }],
    ["an exam more than a year away", { examDate: "2027-10-03" }],
    ["no topics", { topics: [] }],
    ["too little time a day", { dailyMinutes: 9 }],
    ["too much time a day", { dailyMinutes: 241 }],
    ["no study days", { daysPerWeek: 0 }],
    ["more than seven study days", { daysPerWeek: 8 }],
    ["a target below 50", { targetScore: 49 }],
    ["a target above 100", { targetScore: 101 }],
    ["a fractional number of days", { daysPerWeek: 2.5 }],
  ])("refuses %s", (_label, overrides) => {
    expect(() => generateStudyPlan(input(overrides))).toThrow(ValidationError);
  });

  it("accepts an exam exactly 52 weeks away", () => {
    expect(() => generateStudyPlan(input({ examDate: "2027-09-30" }))).not.toThrow();
  });
});

describe("generateStudyPlan: determinism", () => {
  it("does not depend on the order of the topics, and does not change them", () => {
    const topics = Object.freeze([A, B, C]);
    const same = generateStudyPlan(input({ topics: [C, A, B] }));
    expect(same).toEqual(generateStudyPlan(input({ topics })));
  });

  it("breaks ties between equal topics by name", () => {
    const equal = [topic("Zeta", 100, null), topic("Alpha", 100, null)];
    const plan = generateStudyPlan(input({ topics: equal }));
    expect(items(plan, 0)[0][1]).toBe("Alpha");
  });
});

describe("generateStudyPlan: why a topic is scheduled", () => {
  it("records the mastery the student had in each topic, and null for one never practised", () => {
    const plan = generateStudyPlan(input());
    const masteryOf = (name: string) =>
      plan.weeks.flatMap((week) => week.items).find((item) => item.topic === name)?.mastery;
    expect(masteryOf("A")).toBe(40);
    expect(masteryOf("B")).toBe(80);
    expect(masteryOf("C")).toBeNull();
  });

  it("gives the mock exam no mastery", () => {
    const plan = generateStudyPlan(input());
    const mock = plan.weeks.flatMap((week) => week.items).find((item) => item.kind === "mock_exam");
    expect(mock?.mastery).toBeNull();
  });
});
