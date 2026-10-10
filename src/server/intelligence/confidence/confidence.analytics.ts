import type { ExamType } from "../../types";
import type { AttemptSignal, Confidence } from "../attempt.types";
import { groupBy } from "../group-by";
import { CONFIDENCE_CONFIG, type ConfidenceConfig } from "./confidence.config";

export interface ConfidenceCounts {
  readonly correctLow: number;
  readonly correctMedium: number;
  readonly correctHigh: number;
  readonly wrongLow: number;
  readonly wrongMedium: number;
  readonly wrongHigh: number;
  /** Attempts for which the student gave no confidence. */
  readonly unrated: number;
}

export interface ConfidenceMatrix extends ConfidenceCounts {
  readonly rated: number;
  /** Of the answers given with high confidence, the share that were wrong (null if there were none). */
  readonly highConfidenceErrorRate: number | null;
  /** Of the answers given with low confidence, the share that were right (null if there were none). */
  readonly lowConfidenceSuccessRate: number | null;
  /** Sure and wrong, often enough to matter. */
  readonly falseConfidence: boolean;
  /** Unsure but usually right. */
  readonly weakConfidence: boolean;
}

export interface ConfidenceReport {
  readonly overall: ConfidenceMatrix;
  /** Topics with the most high-confidence mistakes first. */
  readonly byTopic: ReadonlyArray<{ readonly topic: string } & ConfidenceMatrix>;
  readonly byExamType: ReadonlyArray<{ readonly examType: ExamType } & ConfidenceMatrix>;
  readonly period: { readonly since: string | null };
}

type Cell = keyof Omit<ConfidenceCounts, "unrated">;

const CELL: Readonly<Record<Confidence, { readonly right: Cell; readonly wrong: Cell }>> = {
  low: { right: "correctLow", wrong: "wrongLow" },
  medium: { right: "correctMedium", wrong: "wrongMedium" },
  high: { right: "correctHigh", wrong: "wrongHigh" },
};

/**
 * Deterministic confidence analytics: how often the student's confidence matched the outcome.
 * Pure; formulas in docs/formulas.md (section 2).
 */
export class ConfidenceAnalyticsService {
  constructor(private readonly config: ConfidenceConfig = CONFIDENCE_CONFIG) {}

  analyze(
    attempts: readonly AttemptSignal[],
    options: { readonly since?: Date } = {},
  ): ConfidenceReport {
    const { since } = options;
    const inPeriod =
      since === undefined
        ? attempts
        : attempts.filter((a) => a.answeredAt.getTime() >= since.getTime());

    return {
      overall: this.matrix(inPeriod),
      byTopic: [...groupBy(inPeriod, (a) => a.topic)]
        .map(([topic, group]) => ({ topic, ...this.matrix(group) }))
        .sort((a, b) => b.wrongHigh - a.wrongHigh || a.topic.localeCompare(b.topic)),
      byExamType: [...groupBy(inPeriod, (a) => a.examType)]
        .map(([examType, group]) => ({ examType, ...this.matrix(group) }))
        .sort((a, b) => a.examType.localeCompare(b.examType)),
      period: { since: since === undefined ? null : since.toISOString() },
    };
  }

  private matrix(attempts: readonly AttemptSignal[]): ConfidenceMatrix {
    const counts = {
      correctLow: 0,
      correctMedium: 0,
      correctHigh: 0,
      wrongLow: 0,
      wrongMedium: 0,
      wrongHigh: 0,
      unrated: 0,
    };
    for (const attempt of attempts) {
      if (attempt.confidence === null) counts.unrated += 1;
      else
        counts[attempt.correct ? CELL[attempt.confidence].right : CELL[attempt.confidence].wrong] +=
          1;
    }

    const rated = attempts.length - counts.unrated;
    const high = counts.correctHigh + counts.wrongHigh;
    const low = counts.correctLow + counts.wrongLow;
    const highConfidenceErrorRate = high === 0 ? null : counts.wrongHigh / high;
    const lowConfidenceSuccessRate = low === 0 ? null : counts.correctLow / low;
    const { minRatedAttempts, falseConfidence, weakConfidence } = this.config;
    const enough = rated >= minRatedAttempts;

    return {
      ...counts,
      rated,
      highConfidenceErrorRate,
      lowConfidenceSuccessRate,
      falseConfidence:
        enough &&
        counts.wrongHigh >= falseConfidence.minCount &&
        highConfidenceErrorRate !== null &&
        highConfidenceErrorRate >= falseConfidence.minErrorRate,
      weakConfidence:
        enough &&
        counts.correctLow >= weakConfidence.minCount &&
        lowConfidenceSuccessRate !== null &&
        lowConfidenceSuccessRate >= weakConfidence.minSuccessRate,
    };
  }
}
