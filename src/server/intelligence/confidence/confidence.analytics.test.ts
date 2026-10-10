import { describe, expect, it } from "vitest";
import type { AttemptSignal, Confidence } from "../attempt.types";
import { ConfidenceAnalyticsService } from "./confidence.analytics";

const BASE = new Date("2026-10-01T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

let counter = 0;
function attempt(
  correct: boolean,
  confidence: Confidence | null,
  overrides: Partial<AttemptSignal> & { daysAfterBase?: number } = {},
): AttemptSignal {
  counter += 1;
  const { daysAfterBase = 0, ...rest } = overrides;
  return {
    questionId: `q${counter}`,
    topic: "Pharmacology",
    examType: "RN",
    sessionId: `s${counter}`,
    correct,
    answeredAt: new Date(BASE.getTime() + daysAfterBase * DAY_MS),
    difficulty: null,
    confidence,
    timeSpentMs: null,
    ...rest,
  };
}

const many = (count: number, correct: boolean, confidence: Confidence | null, overrides = {}) =>
  Array.from({ length: count }, () => attempt(correct, confidence, overrides));

const service = new ConfidenceAnalyticsService();

describe("ConfidenceAnalyticsService.analyze: the six outcomes", () => {
  it("reports an empty history as no data and flags nothing", () => {
    const { overall, byTopic, byExamType } = service.analyze([]);
    expect(overall).toEqual({
      correctLow: 0,
      correctMedium: 0,
      correctHigh: 0,
      wrongLow: 0,
      wrongMedium: 0,
      wrongHigh: 0,
      unrated: 0,
      rated: 0,
      highConfidenceErrorRate: null,
      lowConfidenceSuccessRate: null,
      falseConfidence: false,
      weakConfidence: false,
    });
    expect(byTopic).toEqual([]);
    expect(byExamType).toEqual([]);
  });

  it("counts each combination of correctness and confidence separately", () => {
    const attempts = [
      ...many(1, true, "low"),
      ...many(2, true, "medium"),
      ...many(3, true, "high"),
      ...many(4, false, "low"),
      ...many(5, false, "medium"),
      ...many(6, false, "high"),
      ...many(7, true, null),
    ];
    const { overall } = service.analyze(attempts);
    expect(overall).toMatchObject({
      correctLow: 1,
      correctMedium: 2,
      correctHigh: 3,
      wrongLow: 4,
      wrongMedium: 5,
      wrongHigh: 6,
      unrated: 7,
      rated: 21,
    });
  });

  it("derives the high-confidence error rate and the low-confidence success rate", () => {
    const attempts = [
      ...many(3, true, "high"),
      ...many(6, false, "high"),
      ...many(1, true, "low"),
      ...many(4, false, "low"),
    ];
    const { overall } = service.analyze(attempts);
    expect(overall.highConfidenceErrorRate).toBeCloseTo(6 / 9, 5);
    expect(overall.lowConfidenceSuccessRate).toBeCloseTo(1 / 5, 5);
  });

  it("leaves the rates empty when the student never used that confidence", () => {
    const { overall } = service.analyze(many(8, true, "medium"));
    expect(overall.highConfidenceErrorRate).toBeNull();
    expect(overall.lowConfidenceSuccessRate).toBeNull();
  });

  it("counts attempts without a confidence only as unrated", () => {
    const { overall } = service.analyze(many(4, false, null));
    expect(overall).toMatchObject({ unrated: 4, rated: 0, wrongHigh: 0, falseConfidence: false });
  });
});

describe("ConfidenceAnalyticsService.analyze: patterns", () => {
  it("flags false confidence: sure and wrong, often enough", () => {
    const { overall } = service.analyze([...many(3, false, "high"), ...many(2, true, "high")]);
    expect(overall.falseConfidence).toBe(true); // 3 wrong, 3/5 = 60% of high-confidence answers
  });

  it("does not flag false confidence from a few mistakes among many right answers", () => {
    const { overall } = service.analyze([...many(3, false, "high"), ...many(30, true, "high")]);
    expect(overall.falseConfidence).toBe(false); // 3/33 = 9% < 25%
  });

  it("does not flag false confidence below the minimum count", () => {
    const { overall } = service.analyze([...many(2, false, "high"), ...many(3, true, "high")]);
    expect(overall.falseConfidence).toBe(false);
  });

  it("flags weak confidence: unsure but usually right", () => {
    const { overall } = service.analyze([...many(3, true, "low"), ...many(2, false, "low")]);
    expect(overall.weakConfidence).toBe(true); // 3 correct, 3/5 = 60% right
  });

  it("does not flag weak confidence when being unsure matches being wrong", () => {
    const { overall } = service.analyze([...many(3, true, "low"), ...many(7, false, "low")]);
    expect(overall.weakConfidence).toBe(false); // 30% right
  });

  it("flags nothing before enough attempts are rated", () => {
    const { overall } = service.analyze(many(4, false, "high"));
    expect(overall.rated).toBe(4);
    expect(overall.falseConfidence).toBe(false);
  });
});

describe("ConfidenceAnalyticsService.analyze: grouping and period", () => {
  it("groups by topic, listing the topics with the most false confidence first", () => {
    const attempts = [
      ...many(2, false, "high", { topic: "Anatomy" }),
      ...many(5, false, "high", { topic: "Ethics" }),
      ...many(1, false, "high", { topic: "Pharmacology" }),
    ];
    const { byTopic } = service.analyze(attempts);
    expect(byTopic.map((entry) => [entry.topic, entry.wrongHigh])).toEqual([
      ["Ethics", 5],
      ["Anatomy", 2],
      ["Pharmacology", 1],
    ]);
  });

  it("breaks ties between topics alphabetically", () => {
    const attempts = [
      ...many(1, false, "high", { topic: "B" }),
      ...many(1, false, "high", { topic: "A" }),
    ];
    expect(service.analyze(attempts).byTopic.map((entry) => entry.topic)).toEqual(["A", "B"]);
  });

  it("separates RN from RM", () => {
    const attempts = [
      ...many(3, false, "high", { examType: "RN" }),
      ...many(2, true, "low", { examType: "RM" }),
    ];
    const { byExamType } = service.analyze(attempts);
    expect(byExamType.find((entry) => entry.examType === "RN")).toMatchObject({ wrongHigh: 3 });
    expect(byExamType.find((entry) => entry.examType === "RM")).toMatchObject({ correctLow: 2 });
  });

  it("limits the analysis to a time period, including its first instant", () => {
    const attempts = [
      ...many(2, false, "high", { daysAfterBase: -1 }),
      ...many(3, false, "high", { daysAfterBase: 0 }),
      ...many(4, false, "high", { daysAfterBase: 5 }),
    ];
    const report = service.analyze(attempts, { since: BASE });
    expect(report.overall.wrongHigh).toBe(7);
    expect(report.period).toEqual({ since: BASE.toISOString() });
    expect(service.analyze(attempts).period).toEqual({ since: null });
  });

  it("gives the same result however the attempts are ordered and leaves its input alone", () => {
    const attempts = Object.freeze([
      ...many(3, false, "high"),
      ...many(2, true, "low", { topic: "Anatomy" }),
    ]);
    expect(service.analyze(attempts)).toEqual(service.analyze([...attempts].reverse()));
  });
});
