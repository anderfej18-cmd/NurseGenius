import { describe, expect, it } from "vitest";
import type { AttemptRecord } from "../attempt.types";
import type { MasteryLevel } from "../mastery/mastery.service";
import { READINESS_CONFIG, type ReadinessComponent } from "./readiness.config";
import { assessReadiness, type ReadinessInput } from "./readiness";

const NOW = new Date("2026-10-10T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

let sequence = 0;
const attempt = (
  overrides: Partial<AttemptRecord> & { readonly daysAgo?: number } = {},
): AttemptRecord => {
  const { daysAgo = 30, ...rest } = overrides;
  sequence += 1;
  return {
    questionId: `q-${sequence}`,
    topic: "A",
    examType: "RN",
    sessionId: "s",
    sessionType: "practice",
    correct: true,
    answeredAt: new Date(NOW.getTime() - daysAgo * DAY_MS),
    difficulty: null,
    confidence: null,
    timeSpentMs: null,
    ...rest,
  };
};
const many = (
  count: number,
  make: (index: number) => Parameters<typeof attempt>[0] = () => ({}),
): AttemptRecord[] => Array.from({ length: count }, (_, index) => attempt(make(index)));

const mastery = (
  score: number,
  attempts: number,
  topics: ReadinessInput["mastery"]["topics"] = [],
) => ({ overall: { score, attempts }, topics }) satisfies ReadinessInput["mastery"];
const time = (timedAttempts: number, medianMs: number | null) =>
  ({
    timedAttempts,
    pace: medianMs === null ? null : { medianMs },
  }) satisfies ReadinessInput["time"];

const input = (
  attempts: readonly AttemptRecord[],
  overrides: Partial<ReadinessInput> = {},
): ReadinessInput => ({
  examType: "RN",
  now: NOW,
  attempts,
  mastery: mastery(72, attempts.length),
  time: time(0, null),
  topicsInBank: 4,
  exam: { date: null, daysToExam: null },
  ...overrides,
});
const value = (report: ReturnType<typeof assessReadiness>, component: ReadinessComponent) =>
  report.components[component].value;

/**
 * 60 attempts, 45 correct. 40 old practice attempts in topic A (30 correct); 20 recent mock-exam
 * attempts in topic B (15 correct), two a day over the last 10 days.
 */
const fullAttempts = (recentType = "mock_exam"): AttemptRecord[] => [
  ...many(40, (i) => ({ topic: "A", correct: i < 30, daysAgo: 30 })),
  ...many(20, (i) => ({
    topic: "B",
    correct: i < 15,
    daysAgo: Math.floor(i / 2),
    sessionType: recentType,
  })),
];

describe("assessReadiness: the whole formula", () => {
  it("combines every component by its weight", () => {
    const attempts = fullAttempts();
    const report = assessReadiness(
      input(attempts, { mastery: mastery(72, 60), time: time(60, 90_000) }),
    );

    // mastery 72/100 = 0.72
    expect(value(report, "mastery")).toBeCloseTo(0.72, 6);
    // (45 + 5) / (60 + 10)
    expect(value(report, "accuracy")).toBeCloseTo(50 / 70, 6);
    // last 14 days: 20 attempts, 15 correct: (15 + 5) / (20 + 10)
    expect(value(report, "recent")).toBeCloseTo(20 / 30, 6);
    // 20 mock-exam attempts, 15 correct: same arithmetic
    expect(value(report, "mockExam")).toBeCloseTo(20 / 30, 6);
    // 10 active days of a target of 10
    expect(value(report, "consistency")).toBe(1);
    // median 90 s is at the target
    expect(value(report, "speed")).toBe(1);
    // topics A and B have at least 5 attempts: 2 of 4 topics in the bank
    expect(value(report, "coverage")).toBe(0.5);
    // no question was missed twice
    expect(value(report, "repeatedMistakes")).toBe(1);

    // .25*.72 + .10*(50/70) + .15*(2/3) + .15*(2/3) + .10*1 + .05*1 + .10*.5 + .10*1 = 0.751428...
    expect(report.readinessScore).toBe(75.1);
    expect(report.band).toBe("strong");
    expect(report.completeness).toBe(1);
    expect(report.attempts).toBe(60);
  });

  it("drops the components without data and renormalises the rest", () => {
    // No timing and no mock exams: speed (0.05) and mockExam (0.15) are left out, 0.80 remains.
    const report = assessReadiness(input(fullAttempts("practice"), { mastery: mastery(72, 60) }));

    expect(report.components.speed).toMatchObject({ value: null, used: false });
    expect(report.components.mockExam).toMatchObject({ value: null, used: false });
    // (.25*.72 + .10*(50/70) + .15*(2/3) + .10*1 + .10*.5 + .10*1) / .80 = 0.751785...
    expect(report.readinessScore).toBe(75.2);
    expect(report.completeness).toBeCloseTo(0.8, 6);
  });

  it("reports the headline figures as percentages", () => {
    const report = assessReadiness(
      input(fullAttempts(), { mastery: mastery(72, 60), time: time(60, 90_000) }),
    );
    expect(report).toMatchObject({ mastery: 72, accuracy: 71.4, consistency: 100, speed: 100 });
  });
});

describe("assessReadiness: not enough practice", () => {
  it("gives no score for two correct answers, however perfect", () => {
    const report = assessReadiness(input(many(2, () => ({ daysAgo: 0 }))));
    expect(report.readinessScore).toBeNull();
    expect(report.band).toBe("not_enough_data");
    expect(report.attemptsToScore).toBe(28);
    // (2 + 5) / (2 + 10): a short run of right answers stays near 50%
    expect(value(report, "accuracy")).toBeCloseTo(7 / 12, 6);
    expect(report.recommendations).toEqual([]);
  });

  it("scores from exactly the minimum number of attempts", () => {
    expect(assessReadiness(input(many(29, () => ({ daysAgo: 1 })))).readinessScore).toBeNull();
    const report = assessReadiness(input(many(30, () => ({ daysAgo: 1 }))));
    expect(report.readinessScore).not.toBeNull();
    expect(report.attemptsToScore).toBe(0);
  });

  it("handles a student with no attempts at all", () => {
    const report = assessReadiness(input([], { mastery: mastery(50, 0) }));
    expect(report).toMatchObject({
      readinessScore: null,
      band: "not_enough_data",
      attempts: 0,
      accuracy: null,
      mastery: null,
    });
    expect(value(report, "consistency")).toBeNull();
    expect(value(report, "repeatedMistakes")).toBeNull();
  });
});

describe("assessReadiness: bands", () => {
  it.each([
    [10, "early"],
    [39.9, "early"],
    [40, "developing"],
    [59.9, "developing"],
    [60, "solid"],
    [74.9, "solid"],
    [75, "strong"],
    [100, "strong"],
  ] as const)("a score of %f is %s", (score, band) => {
    // Only mastery varies; the score is read from the band by a custom config with one component.
    const only = {
      ...READINESS_CONFIG,
      weights: {
        mastery: 1,
        accuracy: 0,
        recent: 0,
        mockExam: 0,
        consistency: 0,
        speed: 0,
        coverage: 0,
        repeatedMistakes: 0,
      },
    };
    const report = assessReadiness(
      input(
        many(30, () => ({ daysAgo: 1 })),
        { mastery: mastery(score, 30) },
      ),
      only,
    );
    expect(report.band).toBe(band);
  });
});

describe("assessReadiness: components", () => {
  it("takes the recent result only from the last 14 days, needing 10 attempts", () => {
    const nine = many(9, () => ({ daysAgo: 1 }));
    expect(value(assessReadiness(input(nine)), "recent")).toBeNull();

    const recent = many(10, () => ({ daysAgo: 1 }));
    const old = many(10, () => ({ daysAgo: 40, correct: false }));
    // old attempts are ignored: (10 + 5) / (10 + 10)
    expect(value(assessReadiness(input([...recent, ...old])), "recent")).toBeCloseTo(0.75, 6);
  });

  it("counts an attempt exactly 14 days old as recent, and one a moment older as not", () => {
    const edge = many(10, () => ({ daysAgo: 14 }));
    expect(value(assessReadiness(input(edge)), "recent")).toBeCloseTo(0.75, 6);
    const past = many(10, () => ({ daysAgo: 14.001 }));
    expect(value(assessReadiness(input(past)), "recent")).toBeNull();
  });

  it("measures consistency by distinct days practised in the last 14, against a target of 10", () => {
    const days = (count: number) => many(count * 2, (i) => ({ daysAgo: Math.floor(i / 2) }));
    expect(value(assessReadiness(input(days(5))), "consistency")).toBe(0.5);
    expect(value(assessReadiness(input(days(14))), "consistency")).toBe(1);
    // two attempts on one day are one day
    expect(
      value(assessReadiness(input(many(6, () => ({ daysAgo: 2 })))), "consistency"),
    ).toBeCloseTo(0.1, 6);
    // practice only long ago is a real zero, not missing data
    expect(value(assessReadiness(input(many(6, () => ({ daysAgo: 60 })))), "consistency")).toBe(0);
  });

  it("scores speed from the median time: 1 at 90 s or less, 0 at 240 s or more, linear between", () => {
    const base = many(30, () => ({ daysAgo: 1 }));
    const speed = (timed: number, medianMs: number | null) =>
      value(assessReadiness(input(base, { time: time(timed, medianMs) })), "speed");
    expect(speed(30, 60_000)).toBe(1);
    expect(speed(30, 90_000)).toBe(1);
    expect(speed(30, 165_000)).toBeCloseTo(0.5, 6);
    expect(speed(30, 240_000)).toBe(0);
    expect(speed(30, 300_000)).toBe(0);
    expect(speed(19, 90_000)).toBeNull();
    expect(speed(30, null)).toBeNull();
  });

  it("covers a topic once it has 5 attempts, as a share of the topics in the bank", () => {
    const attempts = [
      ...many(5, () => ({ topic: "A" })),
      ...many(5, () => ({ topic: "B" })),
      ...many(5, () => ({ topic: "C" })),
      ...many(4, () => ({ topic: "D" })),
    ];
    expect(value(assessReadiness(input(attempts, { topicsInBank: 6 })), "coverage")).toBe(0.5);
    expect(value(assessReadiness(input(attempts, { topicsInBank: 2 })), "coverage")).toBe(1);
    expect(value(assessReadiness(input(attempts, { topicsInBank: 0 })), "coverage")).toBeNull();
  });

  it("lowers the repeated-mistake component as repeated mistakes grow, to zero at 20%", () => {
    const miss = (questionId: string) => attempt({ questionId, correct: false });
    const fine = (id: number) => attempt({ questionId: `ok-${id}` });
    // 1 repeated mistake among 10 questions: share 0.1 → 1 − 0.1/0.2
    const some = [miss("r"), miss("r"), ...Array.from({ length: 9 }, (_, i) => fine(i))];
    expect(value(assessReadiness(input(some)), "repeatedMistakes")).toBeCloseTo(0.5, 6);
    // 2 of 10: share 0.2 → 0
    const lots = [
      miss("r"),
      miss("r"),
      miss("s"),
      miss("s"),
      ...Array.from({ length: 8 }, (_, i) => fine(i)),
    ];
    expect(value(assessReadiness(input(lots)), "repeatedMistakes")).toBe(0);
    // missed twice but answered correctly since: not a repeated mistake
    const solved = [miss("r"), miss("r"), attempt({ questionId: "r", daysAgo: 0 })];
    expect(value(assessReadiness(input(solved)), "repeatedMistakes")).toBe(1);
  });

  it("measures mock-exam performance only from mock and timed exams, needing 20 attempts", () => {
    const practice = many(30, () => ({ daysAgo: 1, sessionType: "practice" }));
    expect(value(assessReadiness(input(practice)), "mockExam")).toBeNull();

    const timed = many(20, (i) => ({ sessionType: "timed_exam", correct: i < 10 }));
    // (10 + 5) / (20 + 10)
    expect(value(assessReadiness(input([...practice, ...timed])), "mockExam")).toBeCloseTo(0.5, 6);

    const nineteen = many(19, () => ({ sessionType: "mock_exam" }));
    expect(value(assessReadiness(input([...practice, ...nineteen])), "mockExam")).toBeNull();
  });

  it("keeps accuracy below 100% however long a perfect run", () => {
    const report = assessReadiness(input(many(100, () => ({ daysAgo: 1 }))));
    // (100 + 5) / (100 + 10)
    expect(value(report, "accuracy")).toBeCloseTo(105 / 110, 6);
  });
});

describe("assessReadiness: weak topics", () => {
  const topic = (name: string, score: number, level: MasteryLevel) => ({
    topic: name,
    score,
    level,
  });

  it("lists the weak and developing topics, lowest first, leaving out the rest", () => {
    const report = assessReadiness(
      input(many(30), {
        mastery: mastery(60, 30, [
          topic("Y", 55, "developing"),
          topic("Z", 80, "proficient"),
          topic("X", 30, "weak"),
          topic("W", 90, "mastered"),
          topic("V", 50, "insufficient_data"),
        ]),
      }),
    );
    expect(report.weakTopics).toEqual([
      { topic: "X", mastery: 30, level: "weak" },
      { topic: "Y", mastery: 55, level: "developing" },
    ]);
  });

  it("keeps the 5 weakest, breaking ties by name", () => {
    const topics = ["g", "f", "e", "d", "c", "b", "a"].map((name) => topic(name, 40, "weak"));
    const report = assessReadiness(input(many(30), { mastery: mastery(40, 30, topics) }));
    expect(report.weakTopics.map((t) => t.topic)).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("assessReadiness: recommendations", () => {
  const full = (overrides: Partial<ReadinessInput> = {}) =>
    input(fullAttempts(), { mastery: mastery(72, 60), time: time(60, 90_000), ...overrides });

  it("recommends only components below 60%, the largest weighted shortfall first", () => {
    // coverage is 0.5: shortfall .10 × .5 = .05. Mastery 40: .25 × .6 = .15. Speed 0: .05 × 1 = .05.
    const report = assessReadiness(full({ mastery: mastery(40, 60), time: time(60, 240_000) }));
    // speed and coverage tie at .05; the declared component order puts speed first
    expect(report.recommendations.map((r) => r.component)).toEqual([
      "mastery",
      "speed",
      "coverage",
    ]);
    expect(report.recommendations.every((r) => r.message.length > 0)).toBe(true);
  });

  it("recommends nothing when no component is weak", () => {
    const report = assessReadiness(full({ topicsInBank: 2 }));
    expect(report.recommendations).toEqual([]);
  });

  it("suggests a timed exam when none has been taken, after the weaknesses", () => {
    const report = assessReadiness(input(fullAttempts("practice"), { mastery: mastery(72, 60) }));
    expect(report.recommendations.map((r) => r.component)).toEqual(["coverage", "mockExam"]);
  });

  it("stops at the configured number of recommendations", () => {
    const report = assessReadiness(full({ mastery: mastery(40, 60), time: time(60, 240_000) }), {
      ...READINESS_CONFIG,
      maxRecommendations: 1,
    });
    expect(report.recommendations.map((r) => r.component)).toEqual(["mastery"]);
  });
});

describe("assessReadiness: the exam date and the notice", () => {
  it("reports the exam date and its urgency without changing the score", () => {
    const attempts = fullAttempts();
    const without = assessReadiness(input(attempts, { mastery: mastery(72, 60) }));
    const near = assessReadiness(
      input(attempts, {
        mastery: mastery(72, 60),
        exam: { date: "2026-10-20", daysToExam: 10 },
      }),
    );
    expect(near.exam).toEqual({ date: "2026-10-20", daysToExam: 10, urgency: "high" });
    expect(without.exam).toEqual({ date: null, daysToExam: null, urgency: "none" });
    expect(near.readinessScore).toBe(without.readinessScore);
  });

  it("says in the report that the score is not a prediction", () => {
    const { notice } = assessReadiness(input(fullAttempts()));
    expect(notice).toMatch(/not a prediction/i);
  });
});

describe("assessReadiness: determinism", () => {
  it("gives the same report whatever the order of the attempts, without changing them", () => {
    const attempts = Object.freeze(fullAttempts());
    const a = assessReadiness(input(attempts, { mastery: mastery(72, 60) }));
    const b = assessReadiness(input([...attempts].reverse(), { mastery: mastery(72, 60) }));
    expect(b).toEqual(a);
  });
});
