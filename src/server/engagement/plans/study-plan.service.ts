import { NotFoundError, ValidationError } from "@/lib/app-errors";
import { resolveExamType } from "../../exam-type";
import type { AttemptRecord } from "../../intelligence/attempt.types";
import type { MasteryService } from "../../intelligence/mastery/mastery.service";
import type { ReadinessProfile } from "../../intelligence/readiness/readiness.service";
import type { TimeAnalyticsService } from "../../intelligence/time/time-analytics.service";
import { utcDate } from "../../intelligence/utc-days";
import type { ExamType } from "../../types";
import {
  type PlanTopic,
  type PlanWeek,
  type StudyPlanDraft,
  generateStudyPlan,
} from "./study-plan";
import { STUDY_PLAN_CONFIG, type StudyPlanConfig } from "./study-plan.config";
import { type PlanProgress, planProgress } from "./study-plan-progress";

export interface StudyPlanSettings {
  readonly dailyMinutes: number;
  readonly daysPerWeek: number;
  readonly targetScore: number;
}

/** A plan as stored: what it was made for, and the plan itself. */
export interface StoredStudyPlan {
  readonly examType: ExamType;
  readonly settings: StudyPlanSettings;
  readonly draft: StudyPlanDraft;
  readonly createdAt: Date;
}

export interface StudyPlanView {
  readonly examType: ExamType;
  readonly settings: StudyPlanSettings;
  readonly createdAt: Date;
  readonly plan: StudyPlanDraft;
  readonly progress: PlanProgress;
  /** The student's exam date is no longer the one the plan was made for; making a new plan fixes it. */
  readonly examDateChanged: boolean;
  /** Why the plan should be updated now, or null: the exam date moved (first), or the student fell behind. */
  readonly attention: "exam_date_changed" | "behind" | null;
}

/** What this service needs from the rest of the system; declared here, next to its only consumer. */
interface Dependencies {
  readonly profile: { getReadinessProfile(userId: string): Promise<ReadinessProfile | null> };
  readonly store: {
    getPlan(userId: string): Promise<StoredStudyPlan | null>;
    /** Replaces the student's plan; a student has at most one. */
    savePlan(userId: string, plan: StoredStudyPlan): Promise<void>;
    setExamDate(userId: string, examDate: string): Promise<void>;
  };
  readonly history: { load(userId: string): Promise<readonly AttemptRecord[]> };
  readonly mastery: MasteryService;
  readonly time: TimeAnalyticsService;
  readonly catalog: { topicCounts(examType: ExamType): Promise<Record<string, number>> };
  readonly clock: () => Date;
  readonly config?: StudyPlanConfig;
}

/**
 * A student's study plan: made from the exam date, their study time and the topics in the bank, and
 * weighted toward what they are weakest at. Progress is derived from their answers each time it is
 * read, never stored. Rules in docs/formulas.md (section 13).
 */
export class StudyPlanService {
  private readonly config: StudyPlanConfig;

  constructor(private readonly deps: Dependencies) {
    this.config = deps.config ?? STUDY_PLAN_CONFIG;
  }

  /**
   * Makes a new plan from today. Weeks of an earlier plan for the same exam that had already begun are
   * kept, cut at yesterday, so the work done in them stays in the plan; the rest is planned afresh
   * from the student's current mastery.
   */
  async create(
    userId: string,
    request: Partial<StudyPlanSettings> & { readonly examType?: ExamType },
  ): Promise<StudyPlanView> {
    const { profile, store, history, mastery, time, catalog, clock } = this.deps;
    const student = await profile.getReadinessProfile(userId);
    if (student === null) throw new NotFoundError("Profile not found.");
    if (student.examDate === null) {
      throw new ValidationError("Set your exam date in your profile to make a study plan.");
    }
    const examType = resolveExamType(request.examType, student.examPreference);

    const now = clock();
    const [all, bank] = await Promise.all([history.load(userId), catalog.topicCounts(examType)]);
    const attempts = all.filter((attempt) => attempt.examType === examType);

    const settings: StudyPlanSettings = {
      dailyMinutes: request.dailyMinutes ?? this.config.dailyMinutes.default,
      daysPerWeek: request.daysPerWeek ?? this.config.daysPerWeek.default,
      targetScore: request.targetScore ?? this.config.targetScore.default,
    };
    const average = time.analyze(attempts).overall?.averageMs;
    const scores = new Map(mastery.analyze(attempts, now).topics.map((t) => [t.topic, t.score]));
    const topics = Object.entries(bank).map(
      ([topic, questionCount]): PlanTopic => ({
        topic,
        questionCount,
        mastery: scores.get(topic) ?? null,
      }),
    );

    const draft = generateStudyPlan(
      {
        today: utcDate(now),
        examDate: student.examDate,
        ...settings,
        secondsPerQuestion: average === undefined ? null : average / 1000,
        topics,
      },
      this.config,
    );
    const kept = keptWeeks(await store.getPlan(userId), examType, draft.startsOn);
    const plan: StoredStudyPlan = {
      examType,
      settings,
      draft: kept.length === 0 ? draft : continuePlan(kept, draft),
      createdAt: now,
    };
    await store.savePlan(userId, plan);
    return this.view(plan, attempts, student.examDate, now);
  }

  /** The student's plan with how much of it is done, or null if they have none. */
  async get(userId: string): Promise<StudyPlanView | null> {
    const { profile, store, history, clock } = this.deps;
    const [plan, student] = await Promise.all([
      store.getPlan(userId),
      profile.getReadinessProfile(userId),
    ]);
    if (student === null) throw new NotFoundError("Profile not found.");
    if (plan === null) return null;

    const all = await history.load(userId);
    const attempts = all.filter((attempt) => attempt.examType === plan.examType);
    return this.view(plan, attempts, student.examDate, clock());
  }

  /** Saves the student's exam date. It must be in the future and within two years. */
  async setExamDate(userId: string, examDate: string): Promise<void> {
    const today = utcDate(this.deps.clock());
    if (!isCalendarDate(examDate)) throw new ValidationError("Enter a valid exam date.");
    if (examDate <= today) throw new ValidationError("The exam date must be in the future.");
    if (examDate > addYears(today, MAX_EXAM_YEARS)) {
      throw new ValidationError(`The exam date must be within ${MAX_EXAM_YEARS} years.`);
    }
    await this.deps.store.setExamDate(userId, examDate);
  }

  private view(
    plan: StoredStudyPlan,
    attempts: readonly AttemptRecord[],
    currentExamDate: string | null,
    now: Date,
  ): StudyPlanView {
    const progress = planProgress(plan.draft, attempts, utcDate(now), this.config);
    const examDateChanged = currentExamDate !== plan.draft.examDate;
    return {
      examType: plan.examType,
      settings: plan.settings,
      createdAt: plan.createdAt,
      plan: plan.draft,
      progress,
      examDateChanged,
      attention: examDateChanged
        ? "exam_date_changed"
        : progress.status === "behind"
          ? "behind"
          : null,
    };
  }
}

const MAX_EXAM_YEARS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

const isCalendarDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;

function addYears(date: string, years: number): string {
  const moved = new Date(`${date}T00:00:00.000Z`);
  moved.setUTCFullYear(moved.getUTCFullYear() + years);
  return moved.toISOString().slice(0, 10);
}

const dayBefore = (date: string): string =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) - DAY_MS).toISOString().slice(0, 10);

/** The earlier plan's weeks that began before `today`, cut at yesterday; none if it was for another exam. */
function keptWeeks(
  earlier: StoredStudyPlan | null,
  examType: ExamType,
  today: string,
): readonly PlanWeek[] {
  if (earlier === null || earlier.examType !== examType) return [];
  const yesterday = dayBefore(today);
  return earlier.draft.weeks
    .filter((week) => week.startsOn < today)
    .map((week) => ({
      ...week,
      kind: "learn" as const,
      endsOn: week.endsOn < yesterday ? week.endsOn : yesterday,
    }));
}

/** The kept weeks followed by the new ones, numbered as one plan. */
function continuePlan(kept: readonly PlanWeek[], fresh: StudyPlanDraft): StudyPlanDraft {
  const offset = kept.length;
  const renumbered = fresh.weeks.map((week) => ({
    ...week,
    index: week.index + offset,
    items: week.items.map((item) => ({ ...item, weekIndex: item.weekIndex + offset })),
  }));
  const weeks = [...kept, ...renumbered];
  const questionsIn = (list: readonly PlanWeek[]): number =>
    list.flatMap((week) => week.items).reduce((sum, item) => sum + item.questions, 0);
  return {
    ...fresh,
    startsOn: kept[0].startsOn,
    weeks,
    summary: {
      ...fresh.summary,
      totalQuestions: questionsIn(weeks),
      learnQuestions: questionsIn(weeks.slice(0, -1)),
    },
  };
}
