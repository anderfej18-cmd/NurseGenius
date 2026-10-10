import { describe, expect, it } from "vitest";
import type { AttemptSignal, Confidence, Difficulty } from "../attempt.types";
import { MASTERY_CONFIG } from "./mastery.config";
import { MasteryService } from "./mastery.service";

const NOW = new Date("2026-10-06T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

let counter = 0;
/** One attempt `daysAgo` days before NOW; every attempt gets its own question unless given. */
function attempt(
  overrides: Partial<AttemptSignal> & { correct: boolean; daysAgo?: number },
): AttemptSignal {
  counter += 1;
  const { daysAgo = 0, ...rest } = overrides;
  return {
    questionId: `q${counter}`,
    topic: "Pharmacology",
    examType: "RN",
    sessionId: `s${counter}`,
    answeredAt: new Date(NOW.getTime() - daysAgo * DAY_MS),
    difficulty: null,
    confidence: null,
    timeSpentMs: null,
    ...rest,
  };
}

/** `count` attempts spread over sessions of `perSession` attempts each, all `daysAgo` old. */
function sessions(
  count: number,
  perSession: number,
  correct: (index: number) => boolean,
  daysAgo = 1,
) {
  return Array.from({ length: count }, (_, index) =>
    attempt({
      correct: correct(index),
      daysAgo,
      sessionId: `session-${Math.floor(index / perSession)}`,
    }),
  );
}

const service = new MasteryService();
const topic = (attempts: readonly AttemptSignal[]) =>
  service.analyzeTopic("Pharmacology", attempts, NOW);

describe("MasteryService.analyzeTopic: sample size", () => {
  it("reports no evidence for a topic with no attempts", () => {
    expect(topic([])).toMatchObject({
      topic: "Pharmacology",
      attempts: 0,
      evidence: 0,
      score: 50,
      level: "insufficient_data",
      trend: "unknown",
    });
  });

  it("does not call one correct answer mastery", () => {
    const result = topic([attempt({ correct: true })]);
    // raw 1.0, evidence 1/11: 0.5 + 0.5 * 1/11 = 0.5455
    expect(result.score).toBeCloseTo(54.5, 1);
    expect(result.level).toBe("insufficient_data");
  });

  it("does not call 2 out of 2 correct mastered", () => {
    const result = topic([attempt({ correct: true }), attempt({ correct: true })]);
    // raw 1.0, evidence 2/12: 0.5 + 0.5 * 2/12 = 0.5833
    expect(result.score).toBeCloseTo(58.3, 1);
    expect(result.evidence).toBeCloseTo(2 / 12, 5);
    expect(result.level).toBe("insufficient_data");
  });

  it("gives a long, consistent record far more mastery than a short perfect one", () => {
    const short = topic([attempt({ correct: true }), attempt({ correct: true })]);
    const long = topic(sessions(100, 5, () => true));
    // raw 1.0, evidence 100/110: 0.5 + 0.5 * 100/110 = 0.9545
    expect(long.score).toBeCloseTo(95.5, 1);
    expect(long.level).toBe("mastered");
    expect(long.score).toBeGreaterThan(short.score + 30);
  });

  it("does not grant 'mastered' on a high score alone: it needs enough evidence", () => {
    // 25 perfect attempts: evidence 25/35 = 0.714 (< 0.75), score 0.5 + 0.5 * 0.714 = 85.7
    const result = topic(sessions(25, 5, () => true));
    expect(result.score).toBeCloseTo(85.7, 1);
    expect(result.score).toBeGreaterThanOrEqual(MASTERY_CONFIG.levels.mastered * 100);
    expect(result.level).toBe("proficient");
  });
});

describe("MasteryService.analyzeTopic: performance", () => {
  it("scores consistently poor performance low", () => {
    const result = topic(sessions(50, 5, () => false));
    // raw 0, evidence 50/60: 0.5 + (0 - 0.5) * 50/60 = 0.0833
    expect(result.score).toBeCloseTo(8.3, 1);
    expect(result.level).toBe("weak");
  });

  it("orders mixed performance between poor and perfect", () => {
    const poor = topic(sessions(50, 5, () => false));
    const mixed = topic(sessions(50, 5, (i) => i % 2 === 0));
    const perfect = topic(sessions(50, 5, () => true));
    expect(poor.score).toBeLessThan(mixed.score);
    expect(mixed.score).toBeLessThan(perfect.score);
  });

  it("weights recent attempts more than old ones", () => {
    const old = Array.from({ length: 10 }, () => attempt({ correct: false, daysAgo: 90 }));
    const recent = Array.from({ length: 10 }, () => attempt({ correct: true, daysAgo: 1 }));
    const improving = topic([...old, ...recent]);
    const declining = topic([
      ...old.map((a) => ({ ...a, correct: true })),
      ...recent.map((a) => ({ ...a, correct: false })),
    ]);
    expect(improving.score).toBeGreaterThan(declining.score);
    // old weight 0.5^(90/30) = 0.125 (x10), recent weight 0.5^(1/30) = 0.97716 (x10)
    expect(improving.components.accuracy).toBeCloseTo(9.7716 / 11.0216, 3);
    expect(declining.components.accuracy).toBeCloseTo(1.25 / 11.0216, 3);
  });

  it("detects improvement and decline between the recent window and the attempts before it", () => {
    const older = (correct: boolean) =>
      Array.from({ length: 10 }, () => attempt({ correct, daysAgo: 20 }));
    const newer = (correct: boolean) =>
      Array.from({ length: 10 }, () => attempt({ correct, daysAgo: 2 }));
    expect(topic([...older(false), ...newer(true)]).trend).toBe("improving");
    expect(topic([...older(true), ...newer(false)]).trend).toBe("declining");
    expect(topic([...older(true), ...newer(true)]).trend).toBe("stable");
  });

  it("reports no trend until there are enough earlier attempts to compare with", () => {
    expect(topic(Array.from({ length: 12 }, () => attempt({ correct: true }))).trend).toBe(
      "unknown",
    );
  });

  it("recent performance reflects only the latest window", () => {
    const attempts = [
      ...Array.from({ length: 20 }, () => attempt({ correct: false, daysAgo: 30 })),
      ...Array.from({ length: 10 }, () => attempt({ correct: true, daysAgo: 1 })),
    ];
    expect(topic(attempts).components.recency).toBe(1);
  });

  it("scores consistency as the share of sessions at or above the pass mark", () => {
    // three sessions of 5: accuracies 100%, 80%, 20% -> two of three pass (>= 60%)
    const make = (session: string, correctCount: number) =>
      Array.from({ length: 5 }, (_, i) =>
        attempt({ correct: i < correctCount, sessionId: session }),
      );
    const result = topic([...make("a", 5), ...make("b", 4), ...make("c", 1)]);
    expect(result.components.consistency).toBeCloseTo(2 / 3, 5);
  });

  it("leaves consistency out until two sessions have enough attempts", () => {
    expect(topic(sessions(4, 4, () => true)).components.consistency).toBeNull();
  });
});

describe("MasteryService.analyzeTopic: repeated mistakes", () => {
  it("penalises questions missed repeatedly and never corrected", () => {
    // same accuracy (15 right / 15 wrong); X repeats 5 wrong questions three times each
    const spread = [
      ...Array.from({ length: 15 }, () => attempt({ correct: false, topic: "Y" })),
      ...Array.from({ length: 15 }, () => attempt({ correct: true, topic: "Y" })),
    ];
    const repeated = [
      ...Array.from({ length: 5 }, (_, q) =>
        Array.from({ length: 3 }, (_, k) =>
          attempt({ correct: false, topic: "X", questionId: `rep-${q}`, daysAgo: 3 - k }),
        ),
      ).flat(),
      ...Array.from({ length: 15 }, () => attempt({ correct: true, topic: "X" })),
    ];
    const x = service.analyzeTopic("X", repeated, NOW);
    const y = service.analyzeTopic("Y", spread, NOW);
    expect(x.penalties.repeatedMistakes).toBeCloseTo(0.15 * (5 / 20), 5);
    expect(y.penalties.repeatedMistakes).toBe(0);
    expect(x.score).toBeLessThan(y.score);
  });

  it("does not penalise a question that was missed twice but answered correctly afterwards", () => {
    const q = (correct: boolean, daysAgo: number) =>
      attempt({ correct, questionId: "same", daysAgo });
    const result = topic([q(false, 5), q(false, 4), q(true, 1)]);
    expect(result.penalties.repeatedMistakes).toBe(0);
  });
});

describe("MasteryService.analyzeTopic: confidence and difficulty", () => {
  const rated = (confidence: Confidence, correct: boolean) => attempt({ correct, confidence });

  it("rewards calibrated confidence and punishes false confidence", () => {
    const calibrated = topic(Array.from({ length: 10 }, () => rated("high", true)));
    const overconfident = topic(Array.from({ length: 10 }, () => rated("high", false)));
    // high confidence expects 0.9: |0.9 - 1| = 0.1 -> 0.9, |0.9 - 0| = 0.9 -> 0.1
    expect(calibrated.components.calibration).toBeCloseTo(0.9, 5);
    expect(overconfident.components.calibration).toBeCloseTo(0.1, 5);
  });

  it("rates a hesitant correct answer as better calibrated than a confident wrong one", () => {
    const hesitant = topic(Array.from({ length: 6 }, () => rated("low", true)));
    const confidentWrong = topic(Array.from({ length: 6 }, () => rated("high", false)));
    expect(hesitant.components.calibration).toBeCloseTo(0.4, 5);
    expect(hesitant.components.calibration!).toBeGreaterThan(
      confidentWrong.components.calibration!,
    );
  });

  it("leaves calibration out when students were not asked for confidence", () => {
    const result = topic(sessions(20, 5, () => true));
    expect(result.components.calibration).toBeNull();
    expect(result.componentsUsed).not.toContain("calibration");
  });

  it("leaves calibration out until enough attempts carry a confidence", () => {
    expect(
      topic(Array.from({ length: 4 }, () => rated("high", true))).components.calibration,
    ).toBeNull();
  });

  const levelled = (difficulty: Difficulty, correct: boolean) => attempt({ correct, difficulty });

  it("weights hard questions above easy ones", () => {
    const hardRight = topic([
      ...Array.from({ length: 5 }, () => levelled("hard", true)),
      ...Array.from({ length: 5 }, () => levelled("easy", false)),
    ]);
    const easyRight = topic([
      ...Array.from({ length: 5 }, () => levelled("easy", true)),
      ...Array.from({ length: 5 }, () => levelled("hard", false)),
    ]);
    // (1.5 * 5) / (1.5 * 5 + 0.5 * 5) = 0.75 and (0.5 * 5) / 10 = 0.25
    expect(hardRight.components.difficulty).toBeCloseTo(0.75, 5);
    expect(easyRight.components.difficulty).toBeCloseTo(0.25, 5);
    expect(hardRight.score).toBeGreaterThan(easyRight.score);
  });

  it("leaves difficulty out when questions have no known difficulty", () => {
    const result = topic(sessions(20, 5, () => true));
    expect(result.components.difficulty).toBeNull();
    expect(result.componentsUsed).toEqual(["accuracy", "recency", "consistency"]);
  });

  it("renormalises the weights of the components that are present", () => {
    // only accuracy and recency are available: both 1.0 -> raw 1.0 regardless of their weights
    const result = topic(Array.from({ length: 4 }, () => attempt({ correct: true })));
    expect(result.componentsUsed).toEqual(["accuracy", "recency"]);
    expect(result.rawScore).toBeCloseTo(1, 5);
  });
});

describe("MasteryService: determinism and input handling", () => {
  it("returns the same result however the attempts are ordered, and does not change its input", () => {
    const attempts = Object.freeze(
      sessions(30, 5, (i) => i % 3 !== 0).map((a) => Object.freeze(a)),
    );
    const reversed = [...attempts].reverse();
    expect(topic(attempts)).toEqual(topic(reversed));
    expect(attempts).toHaveLength(30);
  });

  it("treats attempts dated in the future as happening now", () => {
    const future = topic([attempt({ correct: true, daysAgo: -5 })]);
    const now = topic([attempt({ correct: true, daysAgo: 0 })]);
    expect(future.score).toBe(now.score);
  });

  it("ignores attempts that belong to another topic", () => {
    const result = service.analyzeTopic(
      "Pharmacology",
      [attempt({ correct: true, topic: "Anatomy" })],
      NOW,
    );
    expect(result.attempts).toBe(0);
  });

  it("uses an injected config", () => {
    const strict = new MasteryService({
      ...MASTERY_CONFIG,
      shrinkage: { prior: 0.5, strength: 1000 },
    });
    const result = strict.analyzeTopic(
      "Pharmacology",
      sessions(100, 5, () => true),
      NOW,
    );
    expect(result.score).toBeLessThan(60);
  });
});

describe("MasteryService.analyze", () => {
  it("groups attempts by topic and lists the weakest first", () => {
    const attempts = [
      ...sessions(30, 5, () => true).map((a) => ({ ...a, topic: "Anatomy" })),
      ...sessions(30, 5, () => false).map((a) => ({ ...a, topic: "Pharmacology" })),
      ...sessions(30, 5, (i) => i % 2 === 0).map((a) => ({ ...a, topic: "Ethics" })),
    ];
    const report = service.analyze(attempts, NOW);
    expect(report.topics.map((t) => t.topic)).toEqual(["Pharmacology", "Ethics", "Anatomy"]);
  });

  it("weights the overall score by evidence, so a large topic outweighs a tiny one", () => {
    const attempts = [
      ...sessions(100, 5, () => false).map((a) => ({ ...a, topic: "Big" })),
      ...[attempt({ correct: true, topic: "Tiny" })],
    ];
    const report = service.analyze(attempts, NOW);
    expect(report.overall.attempts).toBe(101);
    expect(report.overall.score).toBeLessThan(15);
  });

  it("reports an empty student as having no evidence", () => {
    expect(service.analyze([], NOW)).toEqual({
      topics: [],
      overall: { score: 50, level: "insufficient_data", evidence: 0, attempts: 0 },
    });
  });
});
