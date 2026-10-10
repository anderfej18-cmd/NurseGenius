import type { ExamType } from "../../types";
import { byAnsweredAt } from "../attempt-order";
import type { AttemptRecord, AttemptSignal } from "../attempt.types";
import { type ExamUrgency, examUrgency } from "../exam-urgency";
import { REPEATED_MISTAKE_MIN_MISSES } from "../intelligence.config";
import type { MasteryLevel } from "../mastery/mastery.service";
import { countRepeatedMistakes } from "../repeated-mistakes";
import { clamp01 } from "../statistics";
import {
  READINESS_CONFIG,
  type ReadinessComponent,
  type ReadinessConfig,
} from "./readiness.config";

export type ReadinessBand = "not_enough_data" | "early" | "developing" | "solid" | "strong";

/** What the readiness score needs from the other engines; their reports satisfy these shapes. */
export interface ReadinessInput {
  readonly examType: ExamType;
  readonly now: Date;
  /** This student's attempts at this exam type, in any order. */
  readonly attempts: readonly AttemptRecord[];
  readonly mastery: {
    readonly overall: { readonly score: number; readonly attempts: number };
    readonly topics: ReadonlyArray<{
      readonly topic: string;
      readonly score: number;
      readonly level: MasteryLevel;
    }>;
  };
  readonly time: {
    readonly timedAttempts: number;
    readonly pace: { readonly medianMs: number } | null;
  };
  /** Active topics in the question bank for this exam type. */
  readonly topicsInBank: number;
  readonly exam: { readonly date: string | null; readonly daysToExam: number | null };
}

export interface ReadinessComponentResult {
  /** 0 to 1, or null when the data for it does not exist. */
  readonly value: number | null;
  readonly weight: number;
  /** Whether it contributed to the score. */
  readonly used: boolean;
}

export interface ReadinessReport {
  readonly examType: ExamType;
  /** 0 to 100, one decimal; null until there are enough attempts. */
  readonly readinessScore: number | null;
  readonly band: ReadinessBand;
  readonly attempts: number;
  /** Attempts still needed before a score is given. */
  readonly attemptsToScore: number;
  /** The share of the formula's weight that had data, 0 to 1. */
  readonly completeness: number;
  readonly components: Readonly<Record<ReadinessComponent, ReadinessComponentResult>>;
  /** The inputs behind the headline, as percentages; null when unknown. */
  readonly accuracy: number | null;
  readonly mastery: number | null;
  readonly speed: number | null;
  readonly consistency: number | null;
  readonly weakTopics: ReadonlyArray<{
    readonly topic: string;
    readonly mastery: number;
    readonly level: MasteryLevel;
  }>;
  readonly recommendations: ReadonlyArray<{
    readonly component: ReadinessComponent;
    readonly message: string;
  }>;
  readonly exam: {
    readonly date: string | null;
    readonly daysToExam: number | null;
    readonly urgency: ExamUrgency;
  };
  readonly notice: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const NOTICE =
  "An internal preparation metric computed from your past practice. It is not a prediction of your exam result.";

const WEAKNESS_MESSAGES: Readonly<Record<ReadinessComponent, string>> = {
  mastery: "Practise your weakest topics until their mastery improves.",
  accuracy: "Read each option carefully: accuracy is the biggest lever on your score.",
  recent: "Your last two weeks are weaker than your history: review your recent mistakes.",
  mockExam: "Your timed exam results are low: practise under exam conditions.",
  consistency: "Practise on more days each week: short daily sessions beat occasional long ones.",
  speed: "Your answers are slow: practise at exam pace.",
  coverage: "Cover more topics: several have had little or no practice.",
  repeatedMistakes: "Clear your repeated mistakes: review the questions you keep missing.",
};
const NO_MOCK_EXAM_MESSAGE =
  "Take a timed mock exam to measure how you perform under exam conditions.";

const round1 = (value: number): number => Math.round(value * 10) / 10;
const toPercent = (value: number | null): number | null =>
  value === null ? null : round1(value * 100);

/**
 * Deterministic exam-readiness score. Pure: the same inputs and config always give the same
 * report. Each component is 0 to 1 or absent; absent ones are dropped and the rest renormalised.
 * The exam date only reports urgency and does not enter the score. Formula in docs/formulas.md
 * (section 9).
 */
export function assessReadiness(
  input: ReadinessInput,
  config: ReadinessConfig = READINESS_CONFIG,
): ReadinessReport {
  const { attempts } = input;
  const values = componentValues(input, config);
  const component = (name: ReadinessComponent): ReadinessComponentResult => ({
    value: values[name],
    weight: config.weights[name],
    used: values[name] !== null,
  });
  const components = {
    mastery: component("mastery"),
    accuracy: component("accuracy"),
    recent: component("recent"),
    mockExam: component("mockExam"),
    consistency: component("consistency"),
    speed: component("speed"),
    coverage: component("coverage"),
    repeatedMistakes: component("repeatedMistakes"),
  } satisfies Record<ReadinessComponent, ReadinessComponentResult>;

  const usedWeight = sum(
    COMPONENTS.map((name) => (components[name].used ? config.weights[name] : 0)),
  );
  const totalWeight = sum(COMPONENTS.map((name) => config.weights[name]));
  const weighted = sum(COMPONENTS.map((name) => config.weights[name] * (values[name] ?? 0)));
  const scorable = attempts.length >= config.minAttempts && usedWeight > 0;
  const readinessScore = scorable ? round1((weighted / usedWeight) * 100) : null;
  const band = bandOf(readinessScore, config);

  return {
    examType: input.examType,
    readinessScore,
    band,
    attempts: attempts.length,
    attemptsToScore: Math.max(0, config.minAttempts - attempts.length),
    completeness: totalWeight > 0 ? usedWeight / totalWeight : 0,
    components,
    accuracy: toPercent(values.accuracy),
    mastery: toPercent(values.mastery),
    speed: toPercent(values.speed),
    consistency: toPercent(values.consistency),
    weakTopics: weakTopics(input, config),
    recommendations: readinessScore === null ? [] : recommendations(components, config),
    exam: {
      date: input.exam.date,
      daysToExam: input.exam.daysToExam,
      urgency: examUrgency(input.exam.daysToExam, config.urgencyDays),
    },
    notice: NOTICE,
  };
}

/** The order components are listed in; it breaks ties between equal shortfalls. */
const COMPONENTS: readonly ReadinessComponent[] = [
  "mastery",
  "accuracy",
  "recent",
  "mockExam",
  "consistency",
  "speed",
  "coverage",
  "repeatedMistakes",
];

const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

function bandOf(score: number | null, config: ReadinessConfig): ReadinessBand {
  if (score === null) return "not_enough_data";
  if (score >= config.bands.strong) return "strong";
  if (score >= config.bands.solid) return "solid";
  if (score >= config.bands.developing) return "developing";
  return "early";
}

function componentValues(
  input: ReadinessInput,
  config: ReadinessConfig,
): Record<ReadinessComponent, number | null> {
  const { attempts, now } = input;
  const since = (days: number) => now.getTime() - days * DAY_MS;
  const within = (days: number) => attempts.filter((a) => a.answeredAt.getTime() >= since(days));
  const accuracyOf = (group: readonly AttemptSignal[]) => shrunkAccuracy(group, config);
  const recent = within(config.recent.days);
  const mock = attempts.filter((a) => config.mockExam.sessionTypes.includes(a.sessionType));

  return {
    mastery: input.mastery.overall.attempts > 0 ? clamp01(input.mastery.overall.score / 100) : null,
    accuracy: attempts.length > 0 ? accuracyOf(attempts) : null,
    recent: recent.length >= config.recent.minAttempts ? accuracyOf(recent) : null,
    mockExam: mock.length >= config.mockExam.minAttempts ? accuracyOf(mock) : null,
    consistency: consistency(attempts.length, within(config.consistency.windowDays), config),
    speed: speed(input.time, config),
    coverage: coverage(attempts, input.topicsInBank, config),
    repeatedMistakes: repeatedMistakes(attempts, config),
  };
}

/** Accuracy with `accuracyPriorStrength` pseudo-attempts at 50% added, so small samples stay near 50%. */
function shrunkAccuracy(group: readonly AttemptSignal[], config: ReadinessConfig): number {
  const k = config.accuracyPriorStrength;
  const correct = group.filter((a) => a.correct).length;
  return (correct + 0.5 * k) / (group.length + k);
}

function consistency(
  totalAttempts: number,
  inWindow: readonly AttemptSignal[],
  config: ReadinessConfig,
): number | null {
  if (totalAttempts === 0) return null;
  const days = new Set(inWindow.map((a) => a.answeredAt.toISOString().slice(0, 10)));
  return clamp01(days.size / config.consistency.targetActiveDays);
}

function speed(time: ReadinessInput["time"], config: ReadinessConfig): number | null {
  const { minTimedAttempts, targetSeconds, slowSeconds } = config.speed;
  if (time.pace === null || time.timedAttempts < minTimedAttempts) return null;
  const seconds = time.pace.medianMs / 1000;
  return clamp01((slowSeconds - seconds) / (slowSeconds - targetSeconds));
}

function coverage(
  attempts: readonly AttemptSignal[],
  topicsInBank: number,
  config: ReadinessConfig,
): number | null {
  if (topicsInBank <= 0) return null;
  const perTopic = new Map<string, number>();
  for (const attempt of attempts)
    perTopic.set(attempt.topic, (perTopic.get(attempt.topic) ?? 0) + 1);
  const covered = [...perTopic.values()].filter(
    (count) => count >= config.coverage.minAttemptsPerTopic,
  ).length;
  return clamp01(covered / topicsInBank);
}

function repeatedMistakes(
  attempts: readonly AttemptRecord[],
  config: ReadinessConfig,
): number | null {
  const { repeated, questions } = countRepeatedMistakes(
    [...attempts].sort(byAnsweredAt),
    REPEATED_MISTAKE_MIN_MISSES,
  );
  if (questions === 0) return null;
  return 1 - clamp01(repeated / questions / config.repeatedMistakes.zeroAtShare);
}

function weakTopics(input: ReadinessInput, config: ReadinessConfig): ReadinessReport["weakTopics"] {
  return input.mastery.topics
    .filter((topic) => topic.level === "weak" || topic.level === "developing")
    .map((topic) => ({ topic: topic.topic, mastery: topic.score, level: topic.level }))
    .sort((a, b) => a.mastery - b.mastery || a.topic.localeCompare(b.topic))
    .slice(0, config.maxWeakTopics);
}

/** Components under the weakness line, the largest weighted shortfall first; then a timed exam if none was taken. */
function recommendations(
  components: Readonly<Record<ReadinessComponent, ReadinessComponentResult>>,
  config: ReadinessConfig,
): ReadinessReport["recommendations"] {
  const weak = COMPONENTS.flatMap((component, order) => {
    const { value, weight } = components[component];
    if (value === null || value >= config.weakBelow) return [];
    // Rounded so that equal shortfalls tie despite floating-point noise; ties keep declared order.
    return [{ component, order, shortfall: Math.round(weight * (1 - value) * 1e6) }];
  })
    .sort((a, b) => b.shortfall - a.shortfall || a.order - b.order)
    .map(({ component }) => ({ component, message: WEAKNESS_MESSAGES[component] }));

  const all: Array<{ component: ReadinessComponent; message: string }> = [...weak];
  if (components.mockExam.value === null) {
    all.push({ component: "mockExam", message: NO_MOCK_EXAM_MESSAGE });
  }
  return all.slice(0, config.maxRecommendations);
}
