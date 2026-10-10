import { describe, expect, it } from "vitest";
import type { AttemptSignal } from "../attempt.types";
import { TIME_CONFIG } from "./time.config";
import { TimeAnalyticsService } from "./time-analytics.service";

const BASE = new Date("2026-10-01T12:00:00.000Z");
const MINUTE_MS = 60 * 1000;

let counter = 0;
function attempt(
  timeSpentMs: number | null,
  correct: boolean,
  overrides: Partial<AttemptSignal> & { minute?: number } = {},
): AttemptSignal {
  counter += 1;
  const { minute = counter, ...rest } = overrides;
  return {
    questionId: `q${counter}`,
    topic: "Pharmacology",
    examType: "RN",
    sessionId: "s1",
    correct,
    answeredAt: new Date(BASE.getTime() + minute * MINUTE_MS),
    difficulty: null,
    confidence: null,
    timeSpentMs,
    ...rest,
  };
}
const times = (
  values: number[],
  correct: boolean | ((i: number) => boolean) = true,
  overrides = {},
) =>
  values.map((ms, i) =>
    attempt(ms, typeof correct === "function" ? correct(i) : correct, overrides),
  );

const service = new TimeAnalyticsService();

describe("TimeAnalyticsService: basic statistics", () => {
  it("reports an empty history as no data", () => {
    const report = service.analyze([]);
    expect(report).toMatchObject({
      timedAttempts: 0,
      untimedAttempts: 0,
      outlierAttempts: 0,
      overall: null,
      correct: null,
      incorrect: null,
    });
    expect(report.byTopic).toEqual([]);
    expect(report.patterns).toBeNull();
    expect(report.insights).toEqual([]);
    expect(report.trend.direction).toBe("unknown");
  });

  it("computes average, median, minimum and maximum", () => {
    const { overall } = service.analyze(times([1000, 2000, 3000, 6000]));
    expect(overall).toEqual({
      count: 4,
      averageMs: 3000,
      medianMs: 2500,
      minMs: 1000,
      maxMs: 6000,
    });
  });

  it("reports one attempt as every statistic", () => {
    expect(service.analyze(times([4200])).overall).toEqual({
      count: 1,
      averageMs: 4200,
      medianMs: 4200,
      minMs: 4200,
      maxMs: 4200,
    });
  });

  it("leaves out attempts with no recorded time, and counts them", () => {
    const report = service.analyze([
      ...times([2000, 4000]),
      attempt(null, true),
      attempt(null, false),
    ]);
    expect(report.timedAttempts).toBe(2);
    expect(report.untimedAttempts).toBe(2);
    expect(report.overall?.averageMs).toBe(3000);
  });

  it("leaves out zero and implausibly long times as outliers, and counts them", () => {
    const report = service.analyze([
      ...times([2000, 4000]),
      attempt(0, true),
      attempt(TIME_CONFIG.maxPlausibleMs + 1, true),
    ]);
    expect(report.outlierAttempts).toBe(2);
    expect(report.timedAttempts).toBe(2);
    expect(report.overall?.maxMs).toBe(4000);
  });

  it("keeps a time exactly at the plausible maximum", () => {
    expect(service.analyze(times([TIME_CONFIG.maxPlausibleMs])).timedAttempts).toBe(1);
  });
});

describe("TimeAnalyticsService: correct against incorrect", () => {
  it("separates the time spent on right and wrong answers", () => {
    const attempts = [...times([2000, 4000], true), ...times([6000, 10000], false)];
    const { correct, incorrect } = service.analyze(attempts);
    expect(correct?.averageMs).toBe(3000);
    expect(incorrect?.averageMs).toBe(8000);
  });

  it("leaves a side empty when there are no such attempts", () => {
    const { correct, incorrect } = service.analyze(times([2000, 4000], true));
    expect(correct).not.toBeNull();
    expect(incorrect).toBeNull();
  });
});

describe("TimeAnalyticsService: by topic", () => {
  it("lists topics with the slowest average first, with their own right and wrong averages", () => {
    const attempts = [
      ...times([1000, 3000], true, { topic: "Anatomy" }),
      ...times([5000], true, { topic: "Ethics" }),
      ...times([9000], false, { topic: "Ethics" }),
    ];
    const { byTopic } = service.analyze(attempts);
    expect(byTopic.map((t) => [t.topic, t.averageMs])).toEqual([
      ["Ethics", 7000],
      ["Anatomy", 2000],
    ]);
    expect(byTopic[0]).toMatchObject({
      correctAverageMs: 5000,
      incorrectAverageMs: 9000,
      count: 2,
    });
    expect(byTopic[1]).toMatchObject({ correctAverageMs: 2000, incorrectAverageMs: null });
  });

  it("breaks ties between topics alphabetically", () => {
    const attempts = [
      ...times([2000], true, { topic: "B" }),
      ...times([2000], true, { topic: "A" }),
    ];
    expect(service.analyze(attempts).byTopic.map((t) => t.topic)).toEqual(["A", "B"]);
  });
});

describe("TimeAnalyticsService: fast and slow, right and wrong", () => {
  // median 5000: fast is 3000 or less, slow is 7500 or more
  const attempts = () => [
    attempt(1000, true),
    ...times([1000, 1000, 1000], false),
    ...times([5000, 5000, 5000, 5000], true),
    attempt(10000, true),
    ...times([10000, 10000, 10000], false),
  ];

  it("counts the four patterns against the student's own median", () => {
    const report = service.analyze(attempts());
    expect(report.pace).toEqual({ medianMs: 5000, fastAtOrBelowMs: 3000, slowAtOrAboveMs: 7500 });
    expect(report.patterns).toMatchObject({
      fastCorrect: 1,
      fastIncorrect: 3,
      slowCorrect: 1,
      slowIncorrect: 3,
      typicalCorrect: 4,
      typicalIncorrect: 0,
    });
  });

  it("treats the thresholds as inclusive", () => {
    const report = service.analyze([
      ...times([3000, 3000], true),
      ...times([5000, 5000, 5000, 5000, 5000, 5000], true),
      ...times([7500, 7500], false),
    ]);
    expect(report.patterns).toMatchObject({ fastCorrect: 2, slowIncorrect: 2 });
  });

  it("reports no patterns before enough attempts are timed", () => {
    expect(service.analyze(times([1000, 2000, 3000], true)).patterns).toBeNull();
  });

  it("explains what the patterns suggest", () => {
    const codes = service.analyze(attempts()).insights.map((i) => i.code);
    expect(codes).toEqual(["rushing", "struggling"]); // 3/12 fast and wrong, 3/12 slow and wrong
  });

  it("says a student is careful but slow when many right answers take long", () => {
    const report = service.analyze([
      ...times([10000, 10000, 10000], true),
      ...times([4000, 4000, 4000, 4000, 4000, 4000, 4000], true),
    ]);
    expect(report.insights.map((i) => i.code)).toEqual(["carefulButSlow"]);
  });

  it("says a student is efficient when many right answers come quickly", () => {
    const report = service.analyze([
      ...times([1000, 1000, 1000], true),
      ...times([5000, 5000, 5000, 5000, 5000, 5000, 5000], true),
    ]);
    expect(report.insights.map((i) => i.code)).toEqual(["efficient"]);
  });

  it("does not raise an insight from a handful of attempts", () => {
    const report = service.analyze([
      ...times([1000, 1000], false),
      ...times([5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000], true),
    ]);
    expect(report.insights).toEqual([]); // two fast wrong answers is below the minimum count of 3
  });
});

describe("TimeAnalyticsService: trend", () => {
  const sequence = (older: number, newer: number) => [
    ...times(Array(20).fill(older), true, { minute: 0 }),
    ...times(Array(20).fill(newer), true, { minute: 1000 }),
  ];

  it("detects answering faster, slower or at the same pace", () => {
    expect(service.analyze(sequence(6000, 4000)).trend).toMatchObject({
      direction: "faster",
      previousAverageMs: 6000,
      recentAverageMs: 4000,
    });
    expect(service.analyze(sequence(4000, 6000)).trend.direction).toBe("slower");
    expect(service.analyze(sequence(5000, 5200)).trend.direction).toBe("steady");
  });

  it("reports the change as a share of the earlier average", () => {
    expect(service.analyze(sequence(5000, 4000)).trend.changePct).toBe(-20);
  });

  it("is unknown without enough earlier attempts to compare with", () => {
    expect(service.analyze(times(Array(25).fill(4000))).trend.direction).toBe("unknown");
  });
});

describe("TimeAnalyticsService: question level and period", () => {
  it("lists the slowest questions by their average time", () => {
    const slow = (id: string, ms: number[]) => ms.map((t) => attempt(t, true, { questionId: id }));
    const report = service.analyze([
      ...slow("a", [9000, 11000]),
      ...slow("b", [2000]),
      ...slow("c", [7000]),
    ]);
    expect(report.slowestQuestions.map((q) => [q.questionId, q.averageMs, q.attempts])).toEqual([
      ["a", 10000, 2],
      ["c", 7000, 1],
      ["b", 2000, 1],
    ]);
  });

  it("lists at most the configured number of questions", () => {
    const report = service.analyze(times([1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000]));
    expect(report.slowestQuestions).toHaveLength(TIME_CONFIG.slowestQuestions);
  });

  it("limits the analysis to a period, including its first instant", () => {
    const attempts = [
      attempt(1000, true, { minute: -5 }),
      attempt(3000, true, { minute: 0 }),
      attempt(5000, true, { minute: 5 }),
    ];
    const report = service.analyze(attempts, { since: BASE });
    expect(report.overall?.averageMs).toBe(4000);
    expect(report.period).toEqual({ since: BASE.toISOString() });
  });

  it("returns the same result however the attempts are ordered, and does not change its input", () => {
    const attempts = Object.freeze([
      ...times(
        [1000, 5000, 9000, 4000, 6000, 2000, 8000, 3000, 7000, 5000, 5000],
        (i) => i % 2 === 0,
      ),
    ]);
    expect(service.analyze(attempts)).toEqual(service.analyze([...attempts].reverse()));
  });
});
