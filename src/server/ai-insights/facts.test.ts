import { describe, expect, it } from "vitest";
import type { DailyPlan } from "../intelligence/recommendation/recommendation.types";
import type { PerformanceReport } from "../intelligence/performance/performance";
import type { ReadinessReport } from "../intelligence/readiness/readiness";
import { checkGrounding } from "./grounding";
import type { StudyPlanView } from "../engagement/plans/study-plan.service";
import { performanceFacts } from "./performance.facts";
import { planFacts } from "./plan.facts";
import { readinessFacts } from "./readiness.facts";
import { recommendationFacts } from "./recommendation.facts";

const plan = (overrides: Partial<DailyPlan> = {}): DailyPlan => ({
  date: "2026-10-09",
  availableMinutes: 30,
  totalQuestions: 22,
  estimatedMinutes: 28,
  urgency: "medium",
  daysToExam: 21,
  limitReached: false,
  blocks: [
    {
      kind: "due_reviews",
      title: "Due reviews",
      questions: 7,
      reason: "7 questions are due for review; reviewing them now keeps them from being forgotten.",
    },
    {
      kind: "topic_practice",
      title: "Pharmacology",
      topic: "Pharmacology",
      mastery: 38.5,
      questions: 15,
      reason: "Pharmacology is a weak topic (38.5% mastery).",
    },
  ],
  notes: [],
  ...overrides,
});

describe("recommendationFacts", () => {
  it("states each part of the plan and the exam date as measured facts", () => {
    const facts = recommendationFacts(plan());
    expect(facts.kind).toBe("recommendation");
    expect(facts.sufficientEvidence).toBe(true);
    expect(facts.topics).toEqual(["Pharmacology"]);
    expect(facts.facts).toContain("You have 30 minutes to study today.");
    expect(facts.facts).toContain("Your exam is in 21 days.");
    expect(facts.facts.some((line) => line.startsWith("Due reviews: 7 questions."))).toBe(true);
  });

  it("builds a computed summary that passes the same grounding checks as AI text", () => {
    const facts = recommendationFacts(plan());
    expect(checkGrounding(facts.fallback, facts)).toEqual({ ok: true });
    expect(facts.fallback.nextAction).toMatch(/due reviews/i);
    expect(facts.fallback.points.map((p) => p.topic)).toContain("Pharmacology");
  });

  it("says plainly that there is no history yet and does not ask the model to personalise", () => {
    const facts = recommendationFacts(
      plan({
        daysToExam: null,
        blocks: [
          {
            kind: "mixed_practice",
            title: "Mixed practice",
            questions: 22,
            reason: "You have no practice history yet: start with a mix of topics.",
          },
        ],
      }),
    );
    expect(facts.sufficientEvidence).toBe(false);
    expect(facts.fallback.summary).toMatch(/no practice history/i);
    expect(facts.facts.join(" ")).not.toMatch(/exam is in/);
  });

  it("does not use the model when today's allowance is used up", () => {
    const facts = recommendationFacts(
      plan({
        limitReached: true,
        blocks: [],
        totalQuestions: 0,
        estimatedMinutes: 0,
        notes: ["Today's question limit has been reached; come back tomorrow."],
      }),
    );
    expect(facts.sufficientEvidence).toBe(false);
    expect(facts.fallback.summary).toMatch(/limit has been reached/);
  });

  it("describes an exam date that has passed without a negative number of days", () => {
    const facts = recommendationFacts(plan({ daysToExam: -3 }));
    expect(facts.facts.join(" ")).toContain("Your exam date has passed.");
    expect(facts.facts.join(" ")).not.toContain("-3");
  });

  it("keeps every line inside the bounds the model call allows", () => {
    const long = "x".repeat(600);
    const facts = recommendationFacts(
      plan({
        blocks: [{ kind: "mistake_review", title: "Mistake review", questions: 5, reason: long }],
      }),
    );
    expect(facts.facts.every((line) => line.length <= 240)).toBe(true);
    expect(facts.fallback.points.every((p) => p.text.length <= 300)).toBe(true);
  });
});

const report = (overrides: Partial<ReadinessReport> = {}): ReadinessReport => ({
  examType: "RN",
  readinessScore: 54.2,
  band: "developing",
  attempts: 340,
  attemptsToScore: 0,
  completeness: 0.875,
  components: {} as ReadinessReport["components"],
  accuracy: 61,
  mastery: 48.3,
  speed: null,
  consistency: 70,
  weakTopics: [
    { topic: "Pharmacology", mastery: 38.5, level: "weak" },
    { topic: "Maternal Health", mastery: 44, level: "developing" },
  ],
  recommendations: [
    { component: "mastery", message: "Practise your weakest topics until their mastery improves." },
  ],
  exam: { date: "2026-10-30", daysToExam: 21, urgency: "medium" },
  notice:
    "An internal preparation metric computed from your past practice. It is not a prediction of your exam result.",
  ...overrides,
});

describe("readinessFacts", () => {
  it("states the estimate, its evidence and the weak topics, and calls it an estimate", () => {
    const facts = readinessFacts(report());
    expect(facts.kind).toBe("readiness");
    expect(facts.sufficientEvidence).toBe(true);
    expect(facts.topics).toEqual(["Pharmacology", "Maternal Health"]);
    expect(facts.facts[0]).toContain("54.2%");
    expect(facts.facts[0]).toContain("340 answers");
    expect(facts.facts.join(" ")).toMatch(/estimate, not a prediction/i);
    expect(facts.facts).toContain("Pharmacology: mastery 38.5% (weak).");
  });

  it("builds a computed summary that passes the grounding checks and promises nothing", () => {
    const facts = readinessFacts(report());
    expect(checkGrounding(facts.fallback, facts)).toEqual({ ok: true });
    expect(facts.fallback.summary).toMatch(/estimate/i);
  });

  it("gives no score and no model call when there are too few answers", () => {
    const facts = readinessFacts(
      report({
        readinessScore: null,
        band: "not_enough_data",
        attempts: 12,
        attemptsToScore: 18,
        weakTopics: [],
        recommendations: [],
      }),
    );
    expect(facts.sufficientEvidence).toBe(false);
    expect(facts.fallback.summary).toContain("12");
    expect(facts.fallback.summary).toContain("18 more");
    expect(checkGrounding(facts.fallback, facts)).toEqual({ ok: true });
    expect(facts.facts.join(" ")).not.toMatch(/readiness estimate: \d/i);
  });

  it("leaves out the exam line when no exam date was set", () => {
    const facts = readinessFacts(
      report({ exam: { date: null, daysToExam: null, urgency: "none" } }),
    );
    expect(facts.facts.join(" ")).not.toMatch(/exam is in/);
  });

  it("states how the estimate moved since the last assessment, when it is known", () => {
    const up = readinessFacts({
      ...report(),
      history: {
        assessedAt: "2026-10-10T15:00:00.000Z",
        previous: { assessedAt: "2026-10-03T09:00:00.000Z", score: 51.1 },
        change: 3.1,
      },
    });
    expect(up.facts).toContain("Your estimate is up 3.1 points since your last assessment.");
    expect(checkGrounding(up.fallback, up)).toEqual({ ok: true });

    const down = readinessFacts({
      ...report(),
      history: {
        assessedAt: "2026-10-10T15:00:00.000Z",
        previous: { assessedAt: "2026-10-03T09:00:00.000Z", score: 58 },
        change: -3.8,
      },
    });
    expect(down.facts).toContain("Your estimate is down 3.8 points since your last assessment.");

    const flat = readinessFacts({
      ...report(),
      history: {
        assessedAt: "2026-10-10T15:00:00.000Z",
        previous: { assessedAt: "2026-10-03T09:00:00.000Z", score: 54.2 },
        change: 0,
      },
    });
    expect(flat.facts).toContain("Your estimate is unchanged since your last assessment.");
  });

  it("says nothing about movement without a previous scored assessment", () => {
    const first = readinessFacts({
      ...report(),
      history: { assessedAt: "x", previous: null, change: null },
    });
    expect(first.facts.join(" ")).not.toMatch(/since your last assessment/);
  });
});

const performance = (overrides: Partial<PerformanceReport> = {}): PerformanceReport => ({
  attempts: 120,
  sufficientEvidence: true,
  attemptsNeeded: 0,
  accuracy: 62.5,
  recent: { attempts: 40, accuracy: 55 },
  earlier: { attempts: 80, accuracy: 66.3 },
  topics: [],
  weakest: [
    {
      topic: "Pharmacology",
      attempts: 30,
      accuracy: 40,
      recent: null,
      earlier: null,
      trend: "declining",
    },
  ],
  strongest: [
    { topic: "Anatomy", attempts: 25, accuracy: 88, recent: null, earlier: null, trend: "stable" },
  ],
  repeatedMistakes: { total: 0, questions: [] },
  revision: { revisited: 0, correctedNext: 0, rate: null },
  pace: null,
  reviews: { due: 3, unresolvedMistakes: 9 },
  unverifiedExams: 0,
  findings: [
    {
      code: "weakest_topic",
      topic: "Pharmacology",
      message: "Pharmacology is your weakest topic: 40% correct over 30 answers.",
    },
    {
      code: "strongest_topic",
      topic: "Anatomy",
      message: "Anatomy is your strongest topic: 88% correct over 25 answers.",
    },
    { code: "reviews_due", topic: null, message: "3 questions are due for review." },
  ],
  ...overrides,
});

describe("performanceFacts", () => {
  it("states the overall figures and every finding, and lists the topics it names", () => {
    const facts = performanceFacts(performance());
    expect(facts.kind).toBe("performance");
    expect(facts.sufficientEvidence).toBe(true);
    expect(facts.facts[0]).toBe("Overall: 62.5% correct over 120 answers.");
    expect(facts.facts).toContain(
      "Pharmacology is your weakest topic: 40% correct over 30 answers.",
    );
    expect(facts.facts.join(" ")).toMatch(/patterns in your results, not proof of a cause/i);
    expect(facts.topics).toEqual(["Pharmacology", "Anatomy"]);
  });

  it("builds a computed summary that passes the grounding checks", () => {
    const facts = performanceFacts(performance());
    expect(checkGrounding(facts.fallback, facts)).toEqual({ ok: true });
    expect(facts.fallback.summary).toContain("62.5%");
    expect(facts.fallback.nextAction).toContain("Pharmacology");
  });

  it("does not use the model, and says how many more answers are needed, with too little history", () => {
    const facts = performanceFacts(
      performance({
        attempts: 12,
        sufficientEvidence: false,
        attemptsNeeded: 18,
        accuracy: null,
        findings: [],
        weakest: [],
        strongest: [],
      }),
    );
    expect(facts.sufficientEvidence).toBe(false);
    expect(facts.fallback.summary).toContain("12");
    expect(facts.fallback.summary).toContain("18 more");
    expect(checkGrounding(facts.fallback, facts)).toEqual({ ok: true });
  });

  it("keeps the unverified-scores note when the history is thin", () => {
    const facts = performanceFacts(
      performance({
        sufficientEvidence: false,
        attempts: 5,
        attemptsNeeded: 25,
        accuracy: null,
        weakest: [],
        strongest: [],
        findings: [
          {
            code: "unverified_scores",
            topic: null,
            message:
              "2 of your earlier tests have scores that could not be verified. This analysis uses your individual answers, checked against the answer key, instead of those scores.",
          },
        ],
      }),
    );
    expect(facts.facts.join(" ")).toContain("could not be verified");
  });
});

const view = (overrides: Partial<StudyPlanView> = {}): StudyPlanView => ({
  examType: "RN",
  settings: { dailyMinutes: 30, daysPerWeek: 5, targetScore: 80 },
  createdAt: new Date("2026-10-01T10:00:00.000Z"),
  plan: {
    startsOn: "2026-10-01",
    examDate: "2026-10-29",
    questionsPerDay: 30,
    weeks: [
      {
        index: 0,
        startsOn: "2026-10-01",
        endsOn: "2026-10-07",
        kind: "learn",
        questionBudget: 150,
        items: [
          { weekIndex: 0, kind: "topic", topic: "Pharmacology", questions: 100, mastery: 38.5 },
          { weekIndex: 0, kind: "topic", topic: "Anatomy", questions: 50, mastery: null },
        ],
      },
      {
        index: 1,
        startsOn: "2026-10-08",
        endsOn: "2026-10-14",
        kind: "final",
        questionBudget: 150,
        items: [{ weekIndex: 1, kind: "mock_exam", topic: null, questions: 50, mastery: null }],
      },
    ],
    summary: {
      totalQuestions: 200,
      learnQuestions: 150,
      unallocatedQuestions: 0,
      unscheduledTopics: [],
    },
  },
  progress: {
    weeks: [
      {
        index: 0,
        planned: 150,
        done: 40,
        items: [
          { kind: "topic", topic: "Pharmacology", questions: 100, done: 30 },
          { kind: "topic", topic: "Anatomy", questions: 50, done: 10 },
        ],
      },
      {
        index: 1,
        planned: 50,
        done: 0,
        items: [{ kind: "mock_exam", topic: null, questions: 50, done: 0 }],
      },
    ],
    questionsDone: 40,
    plannedToDate: 90,
    currentWeek: 0,
    status: "behind",
  },
  examDateChanged: false,
  attention: "behind",
  ...overrides,
});

describe("planFacts", () => {
  it("states the settings, the progress and this week's items with why each is there", () => {
    const facts = planFacts(view(), 21);
    expect(facts.kind).toBe("plan");
    expect(facts.sufficientEvidence).toBe(true);
    expect(facts.topics).toEqual(["Pharmacology", "Anatomy"]);
    expect(facts.facts).toContain("Your exam is in 21 days.");
    expect(facts.facts).toContain(
      "Your plan is 30 minutes a day, 5 days a week, with a target of 80%.",
    );
    expect(facts.facts).toContain(
      "You have done 40 of the 90 planned questions so far, so you are behind the plan.",
    );
    expect(facts.facts).toContain(
      "This week: Pharmacology, 30 of 100 questions done. Pharmacology is at 38.5% mastery against your target of 80%.",
    );
    expect(facts.facts).toContain(
      "This week: Anatomy, 10 of 50 questions done. You have not practised Anatomy yet, so this builds a first measure of it.",
    );
  });

  it("builds a computed summary that passes the grounding checks", () => {
    const facts = planFacts(view(), 21);
    expect(checkGrounding(facts.fallback, facts)).toEqual({ ok: true });
  });

  it("says when the exam date changed and the plan has not been updated", () => {
    const facts = planFacts(view({ examDateChanged: true, attention: "exam_date_changed" }), 21);
    expect(facts.facts.join(" ")).toMatch(/exam date has changed/i);
  });

  it("does not use the model when there is no plan", () => {
    const facts = planFacts(null, null);
    expect(facts.sufficientEvidence).toBe(false);
    expect(facts.fallback.summary).toMatch(/no study plan/i);
    expect(checkGrounding(facts.fallback, facts)).toEqual({ ok: true });
  });
});
