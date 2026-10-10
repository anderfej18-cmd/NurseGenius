import type { AttemptSignal } from "../attempt.types";
import { byAnsweredAt } from "../attempt-order";
import { groupBy } from "../group-by";
import { countRepeatedMistakes } from "../repeated-mistakes";
import { clamp01, mean } from "../statistics";
import { MASTERY_CONFIG, type MasteryConfig } from "./mastery.config";

export type MasteryLevel = "insufficient_data" | "weak" | "developing" | "proficient" | "mastered";
export type MasteryTrend = "improving" | "declining" | "stable" | "unknown";
export type MasteryComponent =
  | "accuracy"
  | "recency"
  | "consistency"
  | "difficulty"
  | "calibration";

export interface TopicMastery {
  readonly topic: string;
  readonly attempts: number;
  /** 0 to 100, one decimal. With little evidence it stays near the prior (50) whatever the raw result. */
  readonly score: number;
  /** 0 to 1, before the sample-size adjustment. */
  readonly rawScore: number;
  /** 0 to 1: how much of the score rests on this student's attempts rather than the prior. */
  readonly evidence: number;
  readonly level: MasteryLevel;
  readonly trend: MasteryTrend;
  /** Each component is 0 to 1, or null when the data for it does not exist. */
  readonly components: Readonly<Record<MasteryComponent, number | null>>;
  readonly componentsUsed: readonly MasteryComponent[];
  readonly penalties: { readonly repeatedMistakes: number };
}

export interface OverallMastery {
  readonly score: number;
  readonly level: MasteryLevel;
  readonly evidence: number;
  readonly attempts: number;
}

export interface MasteryReport {
  /** Weakest first. */
  readonly topics: readonly TopicMastery[];
  readonly overall: OverallMastery;
}

const COMPONENT_ORDER: readonly MasteryComponent[] = [
  "accuracy",
  "recency",
  "consistency",
  "difficulty",
  "calibration",
];
const DAY_MS = 24 * 60 * 60 * 1000;

const toPercent = (value: number): number => Math.round(value * 1000) / 10;

/**
 * Deterministic topic mastery. Pure: the same attempts, time and config always give the same
 * result, with every component visible. The formula is documented in docs/formulas.md (section 1).
 */
export class MasteryService {
  constructor(private readonly config: MasteryConfig = MASTERY_CONFIG) {}

  analyze(attempts: readonly AttemptSignal[], now: Date): MasteryReport {
    const topics = [...new Set(attempts.map((attempt) => attempt.topic))]
      .map((topic) => this.analyzeTopic(topic, attempts, now))
      .sort((a, b) => a.score - b.score || a.topic.localeCompare(b.topic));
    return { topics, overall: this.overall(topics) };
  }

  analyzeTopic(topic: string, attempts: readonly AttemptSignal[], now: Date): TopicMastery {
    const own = attempts.filter((attempt) => attempt.topic === topic).sort(byAnsweredAt);
    if (own.length === 0) return this.noEvidence(topic);

    const components = {
      accuracy: this.weightedAccuracy(own, now),
      recency: this.recentAccuracy(own),
      consistency: this.consistency(own),
      difficulty: this.difficultyPerformance(own),
      calibration: this.calibration(own),
    };
    const { raw, used } = this.combine(components);
    const repeatedMistakes = this.repeatedMistakePenalty(own);
    const adjusted = clamp01(raw - repeatedMistakes);

    const { prior, strength } = this.config.shrinkage;
    const evidence = own.length / (own.length + strength);
    const shrunk = prior + (adjusted - prior) * evidence;

    return {
      topic,
      attempts: own.length,
      score: toPercent(shrunk),
      rawScore: adjusted,
      evidence,
      level: this.level(shrunk, evidence, own.length),
      trend: this.trend(own),
      components,
      componentsUsed: used,
      penalties: { repeatedMistakes },
    };
  }

  private noEvidence(topic: string): TopicMastery {
    return {
      topic,
      attempts: 0,
      score: toPercent(this.config.shrinkage.prior),
      rawScore: this.config.shrinkage.prior,
      evidence: 0,
      level: "insufficient_data",
      trend: "unknown",
      components: {
        accuracy: null,
        recency: null,
        consistency: null,
        difficulty: null,
        calibration: null,
      },
      componentsUsed: [],
      penalties: { repeatedMistakes: 0 },
    };
  }

  private overall(topics: readonly TopicMastery[]): OverallMastery {
    const attempts = topics.reduce((sum, topic) => sum + topic.attempts, 0);
    const { prior, strength } = this.config.shrinkage;
    if (attempts === 0)
      return { score: toPercent(prior), level: "insufficient_data", evidence: 0, attempts: 0 };

    const score = topics.reduce((sum, topic) => sum + topic.score * topic.attempts, 0) / attempts;
    const evidence = attempts / (attempts + strength);
    return {
      score: Math.round(score * 10) / 10,
      level: this.level(score / 100, evidence, attempts),
      evidence,
      attempts,
    };
  }

  /** Share of correct answers, each weighted by 0.5^(age / half-life): old attempts fade. */
  private weightedAccuracy(attempts: readonly AttemptSignal[], now: Date): number {
    const { recencyHalfLifeDays } = this.config;
    let weighted = 0;
    let total = 0;
    for (const attempt of attempts) {
      const ageDays = Math.max(0, (now.getTime() - attempt.answeredAt.getTime()) / DAY_MS);
      const weight = 0.5 ** (ageDays / recencyHalfLifeDays);
      weighted += attempt.correct ? weight : 0;
      total += weight;
    }
    return weighted / total;
  }

  private recentAccuracy(sorted: readonly AttemptSignal[]): number {
    return share(sorted.slice(-this.config.recentWindowAttempts));
  }

  /** Share of qualifying sessions whose accuracy in the topic reached the pass mark. */
  private consistency(attempts: readonly AttemptSignal[]): number | null {
    const { minAttemptsPerSession, minSessions, passMark } = this.config.consistency;
    const bySession = groupBy(attempts, (attempt) => attempt.sessionId);
    const qualifying = [...bySession.values()].filter(
      (session) => session.length >= minAttemptsPerSession,
    );
    if (qualifying.length < minSessions) return null;
    return qualifying.filter((session) => share(session) >= passMark).length / qualifying.length;
  }

  /** Accuracy where hard questions count more than easy ones; only attempts with a known difficulty. */
  private difficultyPerformance(attempts: readonly AttemptSignal[]): number | null {
    const { weights, minAttempts } = this.config.difficulty;
    const known = attempts.flatMap((attempt) =>
      attempt.difficulty === null
        ? []
        : [{ weight: weights[attempt.difficulty], correct: attempt.correct }],
    );
    if (known.length < minAttempts) return null;

    const total = known.reduce((sum, { weight }) => sum + weight, 0);
    const earned = known.reduce((sum, { weight, correct }) => sum + (correct ? weight : 0), 0);
    return earned / total;
  }

  /** 1 minus the mean gap between the expected success of the reported confidence and the outcome. */
  private calibration(attempts: readonly AttemptSignal[]): number | null {
    const { expected, minAttempts } = this.config.calibration;
    const gaps = attempts.flatMap((attempt) =>
      attempt.confidence === null
        ? []
        : [Math.abs(expected[attempt.confidence] - (attempt.correct ? 1 : 0))],
    );
    return gaps.length < minAttempts ? null : 1 - mean(gaps);
  }

  /** Weighted mean of the components that have data, so a missing component never counts as zero. */
  private combine(components: Readonly<Record<MasteryComponent, number | null>>): {
    raw: number;
    used: MasteryComponent[];
  } {
    const present = COMPONENT_ORDER.flatMap((name) => {
      const value = components[name];
      return value === null ? [] : [{ name, value, weight: this.config.weights[name] }];
    });
    const totalWeight = present.reduce((sum, { weight }) => sum + weight, 0);
    const weighted = present.reduce((sum, { value, weight }) => sum + weight * value, 0);
    return { raw: weighted / totalWeight, used: present.map(({ name }) => name) };
  }

  /** Penalty scaled by the share of attempted questions missed repeatedly and never answered correctly since. */
  private repeatedMistakePenalty(sorted: readonly AttemptSignal[]): number {
    const { minMisses, maxPenalty } = this.config.repeatedMistakes;
    const { repeated, questions } = countRepeatedMistakes(sorted, minMisses);
    return maxPenalty * (repeated / questions);
  }

  private level(score: number, evidence: number, attempts: number): MasteryLevel {
    const { minAttempts, developing, proficient, mastered, masteredMinEvidence } =
      this.config.levels;
    if (attempts < minAttempts) return "insufficient_data";
    if (score >= mastered && evidence >= masteredMinEvidence) return "mastered";
    if (score >= proficient) return "proficient";
    if (score >= developing) return "developing";
    return "weak";
  }

  /** Accuracy of the latest window against the window before it. */
  private trend(sorted: readonly AttemptSignal[]): MasteryTrend {
    const { recentWindowAttempts: window } = this.config;
    const { minPreviousAttempts, delta } = this.config.trend;
    const previous = sorted.slice(
      Math.max(0, sorted.length - 2 * window),
      Math.max(0, sorted.length - window),
    );
    if (previous.length < minPreviousAttempts) return "unknown";

    const change = share(sorted.slice(-window)) - share(previous);
    if (change >= delta) return "improving";
    if (change <= -delta) return "declining";
    return "stable";
  }
}

const share = (attempts: readonly AttemptSignal[]): number =>
  attempts.filter((attempt) => attempt.correct).length / attempts.length;
