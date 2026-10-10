import type { AttemptSignal } from "../attempt.types";
import { byAnsweredAt } from "../attempt-order";
import { groupBy } from "../group-by";
import { mean, median } from "../statistics";
import { TIME_CONFIG, type TimeConfig } from "./time.config";

export interface TimeStats {
  readonly count: number;
  readonly averageMs: number;
  readonly medianMs: number;
  readonly minMs: number;
  readonly maxMs: number;
}

export interface TopicTimeStats extends TimeStats {
  readonly topic: string;
  readonly correctAverageMs: number | null;
  readonly incorrectAverageMs: number | null;
}

export interface TimePatterns {
  readonly fastCorrect: number;
  readonly fastIncorrect: number;
  readonly slowCorrect: number;
  readonly slowIncorrect: number;
  readonly typicalCorrect: number;
  readonly typicalIncorrect: number;
}

export type TimeInsightCode = "rushing" | "struggling" | "carefulButSlow" | "efficient";

export interface TimeInsight {
  readonly code: TimeInsightCode;
  readonly message: string;
  readonly count: number;
  /** Share of the timed attempts, 0 to 1. */
  readonly share: number;
}

export interface TimeTrend {
  readonly direction: "faster" | "slower" | "steady" | "unknown";
  readonly recentAverageMs: number | null;
  readonly previousAverageMs: number | null;
  /** Change of the recent average against the earlier one, in percent, one decimal. */
  readonly changePct: number | null;
}

export interface TimeAnalyticsReport {
  readonly timedAttempts: number;
  /** No recorded time. */
  readonly untimedAttempts: number;
  /** A recorded time of zero or longer than the plausible maximum. */
  readonly outlierAttempts: number;
  readonly overall: TimeStats | null;
  readonly correct: TimeStats | null;
  readonly incorrect: TimeStats | null;
  /** Slowest average first. */
  readonly byTopic: readonly TopicTimeStats[];
  readonly pace: {
    readonly medianMs: number;
    readonly fastAtOrBelowMs: number;
    readonly slowAtOrAboveMs: number;
  } | null;
  /** Null until enough attempts are timed. */
  readonly patterns: TimePatterns | null;
  readonly insights: readonly TimeInsight[];
  readonly trend: TimeTrend;
  readonly slowestQuestions: ReadonlyArray<{
    readonly questionId: string;
    readonly averageMs: number;
    readonly attempts: number;
  }>;
  readonly period: { readonly since: string | null };
}

type TimedAttempt = AttemptSignal & { readonly timeSpentMs: number };

const MESSAGES: Readonly<Record<TimeInsightCode, string>> = {
  rushing:
    "Many wrong answers were given unusually quickly: slow down on questions that look familiar.",
  struggling:
    "Many wrong answers took unusually long: these topics need review rather than more time.",
  carefulButSlow: "Many right answers took unusually long: practise answering at exam pace.",
  efficient: "Many right answers came quickly: the pace is exam-ready.",
};

const round = (value: number): number => Math.round(value);

/**
 * Deterministic time analytics over the time spent per answer. Times are client-reported and
 * advisory; attempts without a plausible time are counted and left out. Pure; formulas in
 * docs/formulas.md (section 5).
 */
export class TimeAnalyticsService {
  constructor(private readonly config: TimeConfig = TIME_CONFIG) {}

  analyze(
    attempts: readonly AttemptSignal[],
    options: { readonly since?: Date } = {},
  ): TimeAnalyticsReport {
    const { since } = options;
    const inPeriod =
      since === undefined
        ? attempts
        : attempts.filter((a) => a.answeredAt.getTime() >= since.getTime());
    const { timed, untimed, outliers } = this.classify(inPeriod);
    const pace = timed.length === 0 ? null : this.pace(timed);
    const patterns =
      pace !== null && timed.length >= this.config.minTimedForPatterns
        ? this.patterns(timed, pace)
        : null;

    return {
      timedAttempts: timed.length,
      untimedAttempts: untimed,
      outlierAttempts: outliers,
      overall: stats(timed),
      correct: stats(timed.filter((a) => a.correct)),
      incorrect: stats(timed.filter((a) => !a.correct)),
      byTopic: this.byTopic(timed),
      pace,
      patterns,
      insights: patterns === null ? [] : this.insights(patterns, timed.length),
      trend: this.trend(timed),
      slowestQuestions: this.slowestQuestions(timed),
      period: { since: since === undefined ? null : since.toISOString() },
    };
  }

  private classify(attempts: readonly AttemptSignal[]): {
    timed: TimedAttempt[];
    untimed: number;
    outliers: number;
  } {
    const timed: TimedAttempt[] = [];
    let untimed = 0;
    let outliers = 0;
    for (const attempt of [...attempts].sort(byAnsweredAt)) {
      const ms = attempt.timeSpentMs;
      if (ms === null) untimed += 1;
      else if (ms <= 0 || ms > this.config.maxPlausibleMs) outliers += 1;
      else timed.push({ ...attempt, timeSpentMs: ms });
    }
    return { timed, untimed, outliers };
  }

  private pace(timed: readonly TimedAttempt[]) {
    const medianMs = round(median(timed.map((a) => a.timeSpentMs)));
    return {
      medianMs,
      fastAtOrBelowMs: round(medianMs * this.config.fastFactor),
      slowAtOrAboveMs: round(medianMs * this.config.slowFactor),
    };
  }

  private patterns(
    timed: readonly TimedAttempt[],
    pace: NonNullable<TimeAnalyticsReport["pace"]>,
  ): TimePatterns {
    const counts = {
      fastCorrect: 0,
      fastIncorrect: 0,
      slowCorrect: 0,
      slowIncorrect: 0,
      typicalCorrect: 0,
      typicalIncorrect: 0,
    };
    for (const { timeSpentMs, correct } of timed) {
      const speed =
        timeSpentMs <= pace.fastAtOrBelowMs
          ? "fast"
          : timeSpentMs >= pace.slowAtOrAboveMs
            ? "slow"
            : "typical";
      counts[`${speed}${correct ? "Correct" : "Incorrect"}`] += 1;
    }
    return counts;
  }

  private insights(patterns: TimePatterns, total: number): TimeInsight[] {
    const { minCount, rushing, struggling, carefulButSlow, efficient } = this.config.insights;
    const candidates: ReadonlyArray<readonly [TimeInsightCode, number, number]> = [
      ["rushing", patterns.fastIncorrect, rushing],
      ["struggling", patterns.slowIncorrect, struggling],
      ["carefulButSlow", patterns.slowCorrect, carefulButSlow],
      ["efficient", patterns.fastCorrect, efficient],
    ];
    return candidates
      .filter(([, count, threshold]) => count >= minCount && count / total >= threshold)
      .map(([code, count]) => ({ code, message: MESSAGES[code], count, share: count / total }));
  }

  private byTopic(timed: readonly TimedAttempt[]): TopicTimeStats[] {
    return [...groupBy(timed, (a) => a.topic)]
      .map(([topic, group]) => {
        const right = group.filter((a) => a.correct);
        const wrong = group.filter((a) => !a.correct);
        return {
          topic,
          ...describe(group.map((a) => a.timeSpentMs)),
          correctAverageMs:
            right.length === 0 ? null : round(mean(right.map((a) => a.timeSpentMs))),
          incorrectAverageMs:
            wrong.length === 0 ? null : round(mean(wrong.map((a) => a.timeSpentMs))),
        };
      })
      .sort((a, b) => b.averageMs - a.averageMs || a.topic.localeCompare(b.topic));
  }

  /** Average time of the latest window against the window before it, by answering order. */
  private trend(timed: readonly TimedAttempt[]): TimeTrend {
    const { window, minPrevious, delta } = this.config.trend;
    const recent = timed.slice(-window);
    const previous = timed.slice(
      Math.max(0, timed.length - 2 * window),
      Math.max(0, timed.length - window),
    );
    if (previous.length < minPrevious)
      return {
        direction: "unknown",
        recentAverageMs: null,
        previousAverageMs: null,
        changePct: null,
      };

    const recentAverage = mean(recent.map((a) => a.timeSpentMs));
    const previousAverage = mean(previous.map((a) => a.timeSpentMs));
    const change = (recentAverage - previousAverage) / previousAverage;
    return {
      direction: change <= -delta ? "faster" : change >= delta ? "slower" : "steady",
      recentAverageMs: round(recentAverage),
      previousAverageMs: round(previousAverage),
      changePct: Math.round(change * 1000) / 10,
    };
  }

  private slowestQuestions(timed: readonly TimedAttempt[]) {
    return [...groupBy(timed, (a) => a.questionId)]
      .map(([questionId, group]) => ({
        questionId,
        averageMs: round(mean(group.map((a) => a.timeSpentMs))),
        attempts: group.length,
      }))
      .sort((a, b) => b.averageMs - a.averageMs || a.questionId.localeCompare(b.questionId))
      .slice(0, this.config.slowestQuestions);
  }
}

function stats(timed: readonly TimedAttempt[]): TimeStats | null {
  return timed.length === 0 ? null : describe(timed.map((a) => a.timeSpentMs));
}

/** Statistics of a non-empty list of times. */
function describe(values: readonly number[]): TimeStats {
  return {
    count: values.length,
    averageMs: round(mean(values)),
    medianMs: round(median(values)),
    minMs: Math.min(...values),
    maxMs: Math.max(...values),
  };
}
