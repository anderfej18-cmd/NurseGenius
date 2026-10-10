import { byAnsweredAt } from "../attempt-order";
import type { AttemptRecord } from "../attempt.types";
import { groupBy } from "../group-by";
import { median } from "../statistics";
import { PERFORMANCE_CONFIG, type PerformanceConfig } from "./performance.config";

export type PerformanceTrend = "improving" | "declining" | "stable" | "unknown";

export type FindingCode =
  | "weakest_topic"
  | "strongest_topic"
  | "topic_improving"
  | "topic_declining"
  | "recent_differs"
  | "repeated_mistakes"
  | "revision_effect"
  | "wrong_answers_faster"
  | "reviews_due"
  | "unverified_scores";

export interface PerformanceFinding {
  readonly code: FindingCode;
  readonly topic: string | null;
  /** One measured statement in plain words. It states a pattern in the results, never a cause. */
  readonly message: string;
}

interface Window {
  readonly attempts: number;
  /** Percent correct, one decimal. */
  readonly accuracy: number;
}

export interface TopicPerformance {
  readonly topic: string;
  readonly attempts: number;
  readonly accuracy: number;
  readonly recent: Window | null;
  readonly earlier: Window | null;
  readonly trend: PerformanceTrend;
}

export interface PerformanceInput {
  readonly now: Date;
  /** The student's answers, in any order. Correctness was recomputed from the answer key. */
  readonly attempts: readonly AttemptRecord[];
  /** Questions due for review today. */
  readonly dueReviews: number;
  /** Questions missed and not answered correctly since. */
  readonly unresolvedMistakes: number;
  /** Completed tests whose stored score could not be verified; their scores are not used here. */
  readonly unverifiedExams: number;
}

export interface PerformanceReport {
  readonly attempts: number;
  readonly sufficientEvidence: boolean;
  /** Answers still needed before patterns are reported. */
  readonly attemptsNeeded: number;
  readonly accuracy: number | null;
  readonly recent: Window | null;
  readonly earlier: Window | null;
  readonly topics: readonly TopicPerformance[];
  readonly weakest: readonly TopicPerformance[];
  readonly strongest: readonly TopicPerformance[];
  readonly repeatedMistakes: {
    readonly total: number;
    readonly questions: ReadonlyArray<{
      readonly questionId: string;
      readonly topic: string;
      readonly misses: number;
      readonly attempts: number;
    }>;
  };
  readonly revision: {
    readonly revisited: number;
    readonly correctedNext: number;
    /** Percent, one decimal; null until enough misses were revisited. */
    readonly rate: number | null;
  };
  readonly pace: {
    readonly timedAttempts: number;
    readonly medianSecondsCorrect: number;
    readonly medianSecondsIncorrect: number;
  } | null;
  readonly reviews: { readonly due: number; readonly unresolvedMistakes: number };
  readonly unverifiedExams: number;
  readonly findings: readonly PerformanceFinding[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const round1 = (value: number): number => Math.round(value * 10) / 10;
const share = (correct: number, total: number): number => correct / total;
const percent = (value: number): number => round1(value * 100);

function windowOf(group: readonly AttemptRecord[]): Window | null {
  if (group.length === 0) return null;
  return {
    attempts: group.length,
    accuracy: percent(share(group.filter((a) => a.correct).length, group.length)),
  };
}

function trendOf(
  recent: readonly AttemptRecord[],
  earlier: readonly AttemptRecord[],
  config: PerformanceConfig,
): PerformanceTrend {
  if (recent.length < config.minWindowAttempts || earlier.length < config.minWindowAttempts) {
    return "unknown";
  }
  const change =
    share(recent.filter((a) => a.correct).length, recent.length) -
    share(earlier.filter((a) => a.correct).length, earlier.length);
  if (change >= config.trendDelta) return "improving";
  if (change <= -config.trendDelta) return "declining";
  return "stable";
}

/**
 * What a student's own answers say about how they are doing: strong and weak topics, trends, repeated
 * mistakes, the effect of revisiting missed questions, pace and review backlog. Pure and repeatable.
 * Every finding states a measurement or a pattern, never a cause. Formulas in docs/formulas.md (section 16).
 */
export function analyzePerformance(
  input: PerformanceInput,
  config: PerformanceConfig = PERFORMANCE_CONFIG,
): PerformanceReport {
  const attempts = [...input.attempts].sort(byAnsweredAt);
  const cutoff = input.now.getTime() - config.windowDays * DAY_MS;
  const isRecent = (a: AttemptRecord): boolean => a.answeredAt.getTime() >= cutoff;
  const recent = attempts.filter(isRecent);
  const earlier = attempts.filter((a) => !isRecent(a));

  const enough = attempts.length >= config.minAttempts;
  const base = {
    attempts: attempts.length,
    sufficientEvidence: enough,
    attemptsNeeded: Math.max(0, config.minAttempts - attempts.length),
    reviews: { due: input.dueReviews, unresolvedMistakes: input.unresolvedMistakes },
    unverifiedExams: input.unverifiedExams,
  };
  const unverified = unverifiedFinding(input.unverifiedExams);

  if (!enough) {
    return {
      ...base,
      accuracy: null,
      recent: null,
      earlier: null,
      topics: [],
      weakest: [],
      strongest: [],
      repeatedMistakes: { total: 0, questions: [] },
      revision: { revisited: 0, correctedNext: 0, rate: null },
      pace: null,
      findings: unverified === null ? [] : [unverified],
    };
  }

  const topics = [...groupBy(attempts, (a) => a.topic)].map(([topic, group]): TopicPerformance => {
    const topicRecent = group.filter(isRecent);
    const topicEarlier = group.filter((a) => !isRecent(a));
    return {
      topic,
      attempts: group.length,
      accuracy: percent(share(group.filter((a) => a.correct).length, group.length)),
      recent: windowOf(topicRecent),
      earlier: windowOf(topicEarlier),
      trend: trendOf(topicRecent, topicEarlier, config),
    };
  });
  topics.sort((a, b) => a.accuracy - b.accuracy || a.topic.localeCompare(b.topic));

  const ranked = topics.filter((t) => t.attempts >= config.minTopicAttempts);
  const weakest = ranked
    .filter((t) => t.accuracy < config.weakBelow * 100)
    .slice(0, config.maxListed);
  const strongest = ranked
    .filter((t) => t.accuracy >= config.strongAtOrAbove * 100)
    .reverse()
    .slice(0, config.maxListed);

  const repeatedMistakes = findRepeatedMistakes(attempts, config);
  const revision = revisionEffect(attempts, config);
  const pace = paceOf(attempts, config);
  const overall = windowOf(attempts);

  return {
    ...base,
    accuracy: overall?.accuracy ?? null,
    recent: windowOf(recent),
    earlier: windowOf(earlier),
    topics,
    weakest,
    strongest,
    repeatedMistakes,
    revision,
    pace,
    findings: [
      ...topicFindings(weakest, strongest, topics),
      ...differenceFinding(recent, earlier, config),
      ...(repeatedMistakes.total > 0
        ? [
            {
              code: "repeated_mistakes" as const,
              topic: null,
              message: `${repeatedMistakes.total} ${repeatedMistakes.total === 1 ? "question keeps" : "questions keep"} being missed: each was missed at least ${config.repeatedMistakeMinMisses} times and was wrong the last time you saw it.`,
            },
          ]
        : []),
      ...(revision.rate === null
        ? []
        : [
            {
              code: "revision_effect" as const,
              topic: null,
              message: `After missing a question, you answered it correctly next time ${revision.rate}% of the time (${revision.correctedNext} of ${revision.revisited}).`,
            },
          ]),
      ...paceFinding(pace, config),
      ...(input.dueReviews > 0
        ? [
            {
              code: "reviews_due" as const,
              topic: null,
              message: `${input.dueReviews} ${input.dueReviews === 1 ? "question is" : "questions are"} due for review.`,
            },
          ]
        : []),
      ...(unverified === null ? [] : [unverified]),
    ],
  };
}

function unverifiedFinding(count: number): PerformanceFinding | null {
  if (count <= 0) return null;
  return {
    code: "unverified_scores",
    topic: null,
    message: `${count} of your earlier ${count === 1 ? "test has a score" : "tests have scores"} that could not be verified. This analysis uses your individual answers, checked against the answer key, instead of ${count === 1 ? "that score" : "those scores"}.`,
  };
}

function topicFindings(
  weakest: readonly TopicPerformance[],
  strongest: readonly TopicPerformance[],
  topics: readonly TopicPerformance[],
): PerformanceFinding[] {
  const findings: PerformanceFinding[] = [];
  const weak = weakest[0];
  if (weak !== undefined) {
    findings.push({
      code: "weakest_topic",
      topic: weak.topic,
      message: `${weak.topic} is your weakest topic: ${weak.accuracy}% correct over ${weak.attempts} answers.`,
    });
  }
  const strong = strongest[0];
  if (strong !== undefined) {
    findings.push({
      code: "strongest_topic",
      topic: strong.topic,
      message: `${strong.topic} is your strongest topic: ${strong.accuracy}% correct over ${strong.attempts} answers.`,
    });
  }
  for (const topic of topics) {
    if (topic.recent === null || topic.earlier === null) continue;
    if (topic.trend !== "improving" && topic.trend !== "declining") continue;
    findings.push({
      code: topic.trend === "improving" ? "topic_improving" : "topic_declining",
      topic: topic.topic,
      message: `${topic.topic}: ${topic.recent.accuracy}% correct in the last 14 days, against ${topic.earlier.accuracy}% before (${topic.recent.attempts} and ${topic.earlier.attempts} answers).`,
    });
  }
  return findings;
}

function differenceFinding(
  recent: readonly AttemptRecord[],
  earlier: readonly AttemptRecord[],
  config: PerformanceConfig,
): PerformanceFinding[] {
  if (recent.length < config.minWindowAttempts || earlier.length < config.minWindowAttempts)
    return [];
  const recentWindow = windowOf(recent);
  const earlierWindow = windowOf(earlier);
  if (recentWindow === null || earlierWindow === null) return [];
  const gap = recentWindow.accuracy - earlierWindow.accuracy;
  if (Math.abs(gap) < config.inconsistencyDelta * 100) return [];
  const points = Math.abs(round1(gap));
  return [
    {
      code: "recent_differs",
      topic: null,
      message: `Your last ${config.windowDays} days are ${points} points ${gap < 0 ? "below" : "above"} your earlier results (${recentWindow.accuracy}% over ${recentWindow.attempts} answers, against ${earlierWindow.accuracy}% over ${earlierWindow.attempts}).`,
    },
  ];
}

function findRepeatedMistakes(
  sorted: readonly AttemptRecord[],
  config: PerformanceConfig,
): PerformanceReport["repeatedMistakes"] {
  const found = [...groupBy(sorted, (a) => a.questionId)].flatMap(([questionId, history]) => {
    const misses = history.filter((a) => !a.correct).length;
    const latest = history.at(-1);
    if (misses < config.repeatedMistakeMinMisses || latest === undefined || latest.correct)
      return [];
    return [{ questionId, topic: latest.topic, misses, attempts: history.length }];
  });
  found.sort((a, b) => b.misses - a.misses || a.questionId.localeCompare(b.questionId));
  return { total: found.length, questions: found.slice(0, config.maxListed) };
}

/** Of the misses followed by a later attempt at the same question, how many were right the next time. */
function revisionEffect(
  sorted: readonly AttemptRecord[],
  config: PerformanceConfig,
): PerformanceReport["revision"] {
  let revisited = 0;
  let correctedNext = 0;
  for (const history of groupBy(sorted, (a) => a.questionId).values()) {
    history.forEach((attempt, index) => {
      const next = history[index + 1];
      if (attempt.correct || next === undefined) return;
      revisited += 1;
      if (next.correct) correctedNext += 1;
    });
  }
  return {
    revisited,
    correctedNext,
    rate: revisited >= config.minRevisited ? percent(share(correctedNext, revisited)) : null,
  };
}

function paceOf(
  attempts: readonly AttemptRecord[],
  config: PerformanceConfig,
): PerformanceReport["pace"] {
  const timed = attempts.filter((a) => a.timeSpentMs !== null && a.timeSpentMs > 0);
  if (timed.length < config.pace.minTimedAttempts) return null;
  const seconds = (group: readonly AttemptRecord[]): number | null =>
    group.length === 0 ? null : Math.round(median(group.map((a) => (a.timeSpentMs ?? 0) / 1000)));
  const right = seconds(timed.filter((a) => a.correct));
  const wrong = seconds(timed.filter((a) => !a.correct));
  if (right === null || wrong === null) return null;
  return {
    timedAttempts: timed.length,
    medianSecondsCorrect: right,
    medianSecondsIncorrect: wrong,
  };
}

function paceFinding(
  pace: PerformanceReport["pace"],
  config: PerformanceConfig,
): PerformanceFinding[] {
  if (pace === null) return [];
  if (pace.medianSecondsIncorrect > pace.medianSecondsCorrect * config.pace.rushedRatio) return [];
  return [
    {
      code: "wrong_answers_faster",
      topic: null,
      message: `Your wrong answers took a median of ${pace.medianSecondsIncorrect} seconds, against ${pace.medianSecondsCorrect} seconds for right ones.`,
    },
  ];
}
