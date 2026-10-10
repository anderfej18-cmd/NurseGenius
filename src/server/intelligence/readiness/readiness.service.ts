import { NotFoundError } from "@/lib/app-errors";
import { bestEffort } from "../../errors";
import { resolveExamType } from "../../exam-type";
import type { ExamType } from "../../types";
import type { AttemptRecord } from "../attempt.types";
import type { MasteryService } from "../mastery/mastery.service";
import type { TimeAnalyticsService } from "../time/time-analytics.service";
import { daysUntilDate } from "../utc-days";
import { assessReadiness, type ReadinessReport } from "./readiness";

export interface ReadinessProfile {
  readonly examDate: string | null;
  /** RN, RM or Both, as chosen at onboarding; null if never chosen. */
  readonly examPreference: string | null;
}

/** One stored assessment, newest first when listed. */
export interface ReadinessSnapshot {
  readonly assessedAt: string;
  readonly score: number | null;
  readonly attempts: number;
}

export interface NewReadinessSnapshot {
  readonly examType: ExamType;
  readonly score: number | null;
  readonly band: string;
  readonly attempts: number;
  readonly completeness: number;
  readonly components: Readonly<Record<string, number | null>>;
}

/** When the assessment was made and how it moved since the one before; null if it could not be recorded. */
export interface AssessmentHistory {
  readonly assessedAt: string;
  readonly previous: { readonly assessedAt: string; readonly score: number | null } | null;
  /** Points gained or lost since the previous scored assessment, one decimal; null if there is none. */
  readonly change: number | null;
}

export type ReadinessAssessment = ReadinessReport & { readonly history: AssessmentHistory | null };

/** What this service needs from the rest of the system; declared here, next to its only consumer. */
interface Dependencies {
  readonly history: { load(userId: string): Promise<readonly AttemptRecord[]> };
  readonly mastery: MasteryService;
  readonly time: TimeAnalyticsService;
  readonly store: {
    getReadinessProfile(userId: string): Promise<ReadinessProfile | null>;
    /** Stores the assessment if the evidence changed; returns the latest two, newest first. */
    recordSnapshot(
      userId: string,
      snapshot: NewReadinessSnapshot,
    ): Promise<readonly ReadinessSnapshot[]>;
  };
  readonly catalog: { topicCounts(examType: ExamType): Promise<Record<string, number>> };
  readonly clock: () => Date;
}

/** Measures one student's preparation for one exam; the formula is `assessReadiness`. */
export class ReadinessService {
  constructor(private readonly deps: Dependencies) {}

  async assess(
    userId: string,
    request: { readonly examType?: ExamType },
  ): Promise<ReadinessAssessment> {
    const { history, mastery, time, store, catalog, clock } = this.deps;
    const profile = await store.getReadinessProfile(userId);
    if (profile === null) throw new NotFoundError("Profile not found.");

    const examType = resolveExamType(request.examType, profile.examPreference);

    const now = clock();
    const [all, topics] = await Promise.all([history.load(userId), catalog.topicCounts(examType)]);
    const attempts = all.filter((attempt) => attempt.examType === examType);

    const report = assessReadiness({
      examType,
      now,
      attempts,
      mastery: mastery.analyze(attempts, now),
      time: time.analyze(attempts),
      topicsInBank: Object.keys(topics).length,
      exam: { date: profile.examDate, daysToExam: daysUntilDate(profile.examDate, now) },
    });
    return { ...report, history: await this.remember(userId, report) };
  }

  /** The history is extra: a failure to keep it never withholds the measured report. */
  private async remember(
    userId: string,
    report: ReadinessReport,
  ): Promise<AssessmentHistory | null> {
    let saved: readonly ReadinessSnapshot[] = [];
    await bestEffort(async () => {
      saved = await this.deps.store.recordSnapshot(userId, {
        examType: report.examType,
        score: report.readinessScore,
        band: report.band,
        attempts: report.attempts,
        completeness: report.completeness,
        components: Object.fromEntries(
          Object.entries(report.components).map(([name, part]) => [name, part.value]),
        ),
      });
    }, "readiness snapshot");
    const [latest, previous] = saved;
    if (latest === undefined) return null;
    const change =
      previous !== undefined && previous.score !== null && latest.score !== null
        ? Math.round((latest.score - previous.score) * 10) / 10
        : null;
    return {
      assessedAt: latest.assessedAt,
      previous:
        previous === undefined ? null : { assessedAt: previous.assessedAt, score: previous.score },
      change,
    };
  }
}
