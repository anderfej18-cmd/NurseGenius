import { describe, expect, it } from "vitest";
import type { AttemptRecord } from "../attempt.types";
import { analyzePerformance, type PerformanceInput } from "./performance";

const NOW = new Date("2026-10-10T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

let n = 0;
const attempt = (
  topic: string,
  correct: boolean,
  daysAgo: number,
  extra: Partial<AttemptRecord> = {},
): AttemptRecord => {
  n += 1;
  return {
    questionId: extra.questionId ?? `q-${n}`,
    topic,
    examType: "RN",
    sessionId: `s-${n}`,
    sessionType: "mixed",
    correct,
    answeredAt: new Date(NOW.getTime() - daysAgo * DAY - n * 1000),
    difficulty: null,
    confidence: null,
    timeSpentMs: null,
    ...extra,
  };
};

const many = (count: number, make: (i: number) => AttemptRecord): AttemptRecord[] =>
  Array.from({ length: count }, (_, i) => make(i));

const input = (
  attempts: readonly AttemptRecord[],
  extra: Partial<PerformanceInput> = {},
): PerformanceInput => ({
  now: NOW,
  attempts,
  dueReviews: 0,
  unresolvedMistakes: 0,
  unverifiedExams: 0,
  ...extra,
});

describe("analyzePerformance: evidence", () => {
  it("reports too little evidence, and no patterns, below the minimum number of answers", () => {
    const report = analyzePerformance(
      input(many(12, (i) => attempt("Pharmacology", i % 2 === 0, 3))),
    );
    expect(report.sufficientEvidence).toBe(false);
    expect(report.attempts).toBe(12);
    expect(report.attemptsNeeded).toBe(18);
    expect(report.topics).toEqual([]);
    expect(report.findings).toEqual([]);
  });

  it("works from the answers alone: an empty history gives an empty, honest report", () => {
    const report = analyzePerformance(input([]));
    expect(report).toMatchObject({ attempts: 0, sufficientEvidence: false, accuracy: null });
  });

  it("is repeatable: the same inputs give the same report whatever order the answers arrive in", () => {
    const attempts = [
      ...many(20, (i) => attempt("A", i % 3 !== 0, 2)),
      ...many(20, (i) => attempt("B", i % 2 === 0, 30)),
    ];
    const forward = analyzePerformance(input(attempts));
    const shuffled = analyzePerformance(input([...attempts].reverse()));
    expect(shuffled).toEqual(forward);
  });
});

describe("analyzePerformance: topics", () => {
  const attempts = [
    ...many(20, (i) => attempt("Pharmacology", i < 8, 40 - i)), // 40% overall
    ...many(20, (i) => attempt("Anatomy", i < 18, 40 - i)), // 90%
    ...many(4, (i) => attempt("Ethics", false, 40 - i)), // too few to rank
  ];
  const report = analyzePerformance(input(attempts));

  it("ranks topics with enough answers from weakest to strongest and ignores thin ones for strong/weak", () => {
    expect(report.sufficientEvidence).toBe(true);
    expect(report.weakest.map((t) => t.topic)).toEqual(["Pharmacology"]);
    expect(report.strongest.map((t) => t.topic)).toEqual(["Anatomy"]);
    const ethics = report.topics.find((t) => t.topic === "Ethics");
    expect(ethics).toMatchObject({ attempts: 4, accuracy: 0 });
    expect(report.weakest.concat(report.strongest).some((t) => t.topic === "Ethics")).toBe(false);
  });

  it("states accuracy as a percentage with one decimal", () => {
    expect(report.topics.find((t) => t.topic === "Pharmacology")?.accuracy).toBe(40);
    expect(report.accuracy).toBe(Math.round(((8 + 18) / 44) * 1000) / 10);
  });

  it("words the weakest topic as a measurement", () => {
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        code: "weakest_topic",
        topic: "Pharmacology",
        message: "Pharmacology is your weakest topic: 40% correct over 20 answers.",
      }),
    );
  });
});

describe("analyzePerformance: trends and inconsistency", () => {
  it("reports a topic as improving when the last two weeks beat the weeks before, with enough answers in both", () => {
    const attempts = [
      ...many(16, (i) => attempt("Pharmacology", i < 5, 30 + i)), // earlier 31.3%
      ...many(16, (i) => attempt("Pharmacology", i < 13, 1 + (i % 10))), // recent 81.3%
    ];
    const topic = analyzePerformance(input(attempts)).topics[0];
    expect(topic).toMatchObject({
      topic: "Pharmacology",
      trend: "improving",
      recent: { attempts: 16, accuracy: 81.3 },
      earlier: { attempts: 16, accuracy: 31.3 },
    });
  });

  it("reports declining, stable and unknown (too few answers in a window)", () => {
    const declining = [
      ...many(10, (i) => attempt("A", i < 9, 30 + i)),
      ...many(10, (i) => attempt("A", i < 4, 1 + i)),
    ];
    const stable = [
      ...many(10, (i) => attempt("B", i < 7, 30 + i)),
      ...many(10, (i) => attempt("B", i < 7, 1 + i)),
    ];
    const thin = [
      ...many(20, (i) => attempt("C", i < 10, 30 + i)),
      ...many(3, (i) => attempt("C", true, 1 + i)),
    ];
    const byTopic = Object.fromEntries(
      analyzePerformance(input([...declining, ...stable, ...thin])).topics.map((t) => [
        t.topic,
        t.trend,
      ]),
    );
    expect(byTopic).toEqual({ A: "declining", B: "stable", C: "unknown" });
  });

  it("flags a gap between recent and earlier overall accuracy, in either direction, without naming a cause", () => {
    const attempts = [
      ...many(20, (i) => attempt("A", i < 17, 30 + i)), // earlier 85%
      ...many(20, (i) => attempt("A", i < 10, 1 + (i % 10))), // recent 50%
    ];
    const report = analyzePerformance(input(attempts));
    const finding = report.findings.find((f) => f.code === "recent_differs");
    expect(finding?.message).toBe(
      "Your last 14 days are 35 points below your earlier results (50% over 20 answers, against 85% over 20).",
    );
    expect(finding?.message).not.toMatch(/because|caused|due to/i);
  });

  it("does not flag a gap when either window is thin", () => {
    const attempts = [
      ...many(30, (i) => attempt("A", i < 28, 30 + i)),
      ...many(3, () => attempt("A", false, 1)),
    ];
    expect(analyzePerformance(input(attempts)).findings.map((f) => f.code)).not.toContain(
      "recent_differs",
    );
  });
});

describe("analyzePerformance: repeated mistakes and revisiting", () => {
  it("lists questions missed repeatedly and still wrong, most-missed first", () => {
    const attempts = [
      ...many(30, (i) => attempt("Filler", true, 20 + i)),
      attempt("Pharmacology", false, 9, { questionId: "keep-1" }),
      attempt("Pharmacology", false, 7, { questionId: "keep-1" }),
      attempt("Pharmacology", false, 5, { questionId: "keep-1" }),
      attempt("Anatomy", false, 8, { questionId: "keep-2" }),
      attempt("Anatomy", false, 3, { questionId: "keep-2" }),
      attempt("Anatomy", false, 8, { questionId: "fixed" }),
      attempt("Anatomy", false, 6, { questionId: "fixed" }),
      attempt("Anatomy", true, 2, { questionId: "fixed" }),
    ];
    const report = analyzePerformance(input(attempts));
    expect(report.repeatedMistakes.total).toBe(2);
    expect(report.repeatedMistakes.questions).toEqual([
      { questionId: "keep-1", topic: "Pharmacology", misses: 3, attempts: 3 },
      { questionId: "keep-2", topic: "Anatomy", misses: 2, attempts: 2 },
    ]);
  });

  it("measures how often a missed question was answered correctly the next time", () => {
    const attempts = [
      ...many(30, (i) => attempt("Filler", true, 40 + i)),
      ...many(12, (i) =>
        attempt("A", false, 20, {
          questionId: `r-${i}`,
          answeredAt: new Date(NOW.getTime() - 20 * DAY - i),
        }),
      ),
      ...many(12, (i) =>
        attempt("A", i < 9, 5, {
          questionId: `r-${i}`,
          answeredAt: new Date(NOW.getTime() - 5 * DAY - i),
        }),
      ),
    ];
    const report = analyzePerformance(input(attempts));
    expect(report.revision).toEqual({ revisited: 12, correctedNext: 9, rate: 75 });
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        code: "revision_effect",
        message:
          "After missing a question, you answered it correctly next time 75% of the time (9 of 12).",
      }),
    );
  });

  it("does not report the effect of revisiting on fewer than the minimum number of revisited misses", () => {
    const attempts = [
      ...many(30, (i) => attempt("A", true, 20 + i)),
      attempt("A", false, 9, { questionId: "x" }),
      attempt("A", true, 4, { questionId: "x" }),
    ];
    expect(analyzePerformance(input(attempts)).revision.rate).toBeNull();
  });
});

describe("analyzePerformance: pace", () => {
  it("mentions pace only when enough answers were timed, and only when wrong answers were clearly faster", () => {
    const rushed = [
      ...many(20, (i) => attempt("A", true, 10, { timeSpentMs: 60_000 + i })),
      ...many(20, (i) => attempt("A", false, 10, { timeSpentMs: 30_000 + i })),
    ];
    const report = analyzePerformance(input(rushed));
    expect(report.pace).toMatchObject({
      timedAttempts: 40,
      medianSecondsCorrect: 60,
      medianSecondsIncorrect: 30,
    });
    expect(report.findings.find((f) => f.code === "wrong_answers_faster")?.message).toBe(
      "Your wrong answers took a median of 30 seconds, against 60 seconds for right ones.",
    );

    const even = [
      ...many(20, () => attempt("A", true, 10, { timeSpentMs: 50_000 })),
      ...many(20, () => attempt("A", false, 10, { timeSpentMs: 48_000 })),
    ];
    expect(analyzePerformance(input(even)).findings.map((f) => f.code)).not.toContain(
      "wrong_answers_faster",
    );

    const untimed = many(40, (i) => attempt("A", i % 2 === 0, 10));
    expect(analyzePerformance(input(untimed)).pace).toBeNull();
  });
});

describe("analyzePerformance: reviews and unverified results", () => {
  const base = many(40, (i) => attempt("A", i % 2 === 0, 10));

  it("reports due reviews and unresolved mistakes as counts", () => {
    const report = analyzePerformance(input(base, { dueReviews: 14, unresolvedMistakes: 9 }));
    expect(report.reviews).toEqual({ due: 14, unresolvedMistakes: 9 });
    const codes = report.findings.map((f) => f.code);
    expect(codes).toContain("reviews_due");
    expect(report.findings.find((f) => f.code === "reviews_due")?.message).toBe(
      "14 questions are due for review.",
    );
  });

  it("says plainly when earlier test scores could not be verified, and that the analysis does not use them", () => {
    const report = analyzePerformance(input(base, { unverifiedExams: 3 }));
    expect(report.unverifiedExams).toBe(3);
    expect(report.findings.find((f) => f.code === "unverified_scores")?.message).toBe(
      "3 of your earlier tests have scores that could not be verified. This analysis uses your individual answers, checked against the answer key, instead of those scores.",
    );
  });

  it("mentions neither when there is nothing to say", () => {
    const codes = analyzePerformance(input(base)).findings.map((f) => f.code);
    expect(codes).not.toContain("reviews_due");
    expect(codes).not.toContain("unverified_scores");
  });

  it("keeps the unverified-scores note even when there are too few answers to find patterns", () => {
    const report = analyzePerformance(
      input(
        many(5, () => attempt("A", true, 1)),
        { unverifiedExams: 2 },
      ),
    );
    expect(report.sufficientEvidence).toBe(false);
    expect(report.findings.map((f) => f.code)).toEqual(["unverified_scores"]);
  });
});
