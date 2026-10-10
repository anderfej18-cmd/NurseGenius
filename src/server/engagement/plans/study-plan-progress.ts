import { daysBetweenUtc, utcDate } from "../../intelligence/utc-days";
import type { PlanItemKind, PlanWeek } from "./study-plan";
import { STUDY_PLAN_CONFIG, type StudyPlanConfig } from "./study-plan.config";

/** The part of an answered question the plan's progress needs. */
export interface ProgressAttempt {
  readonly topic: string;
  readonly answeredAt: Date;
  readonly sessionType: string;
}

export interface ItemProgress {
  readonly kind: PlanItemKind;
  readonly topic: string | null;
  readonly questions: number;
  /** Questions answered for this item, never more than it asked for. */
  readonly done: number;
}

export interface WeekProgress {
  readonly index: number;
  readonly planned: number;
  readonly done: number;
  readonly items: readonly ItemProgress[];
}

export type PlanStatus = "not_started" | "behind" | "on_track" | "ahead" | "finished";

export interface PlanProgress {
  readonly weeks: readonly WeekProgress[];
  readonly questionsDone: number;
  /** What the plan expected to be done by today: finished weeks in full, the current week in proportion. */
  readonly plannedToDate: number;
  readonly currentWeek: number | null;
  readonly status: PlanStatus;
}

const MOCK_SESSION_TYPES: readonly string[] = ["mock_exam", "timed_exam"];

const daysFrom = (from: string, to: string): number =>
  daysBetweenUtc(new Date(`${from}T00:00:00.000Z`), new Date(`${to}T00:00:00.000Z`));

/**
 * How much of a stored plan the student has done, from their answers. Derived, not stored: the plan
 * never goes stale. Mock and timed exams count toward the mock-exam item only. Rules in
 * docs/formulas.md (section 13).
 */
export function planProgress(
  plan: { readonly weeks: readonly PlanWeek[] },
  attempts: readonly ProgressAttempt[],
  today: string,
  config: StudyPlanConfig = STUDY_PLAN_CONFIG,
): PlanProgress {
  const weeks = plan.weeks.map((week) => weekProgress(week, attempts));
  const last = plan.weeks[plan.weeks.length - 1];
  const plannedToDate = plan.weeks.reduce(
    (sum, week, i) => sum + expectedByToday(week, weeks[i].planned, today),
    0,
  );
  const questionsDone = weeks.reduce((sum, week) => sum + week.done, 0);
  const current = plan.weeks.find((week) => week.startsOn <= today && today <= week.endsOn);

  return {
    weeks,
    questionsDone,
    plannedToDate,
    currentWeek: current === undefined ? null : current.index,
    status: statusOf(questionsDone, plannedToDate, last.endsOn < today, config),
  };
}

function weekProgress(week: PlanWeek, attempts: readonly ProgressAttempt[]): WeekProgress {
  const inWeek = attempts.filter((attempt) => {
    const day = utcDate(attempt.answeredAt);
    return week.startsOn <= day && day <= week.endsOn;
  });
  const items = week.items.map((item): ItemProgress => {
    const counted = inWeek.filter((attempt) =>
      item.kind === "mock_exam"
        ? MOCK_SESSION_TYPES.includes(attempt.sessionType)
        : !MOCK_SESSION_TYPES.includes(attempt.sessionType) && attempt.topic === item.topic,
    ).length;
    return {
      kind: item.kind,
      topic: item.topic,
      questions: item.questions,
      done: Math.min(counted, item.questions),
    };
  });
  return {
    index: week.index,
    planned: items.reduce((sum, item) => sum + item.questions, 0),
    done: items.reduce((sum, item) => sum + item.done, 0),
    items,
  };
}

/** All of a finished week, none of a future one, and a share of the current week by days elapsed. */
function expectedByToday(week: PlanWeek, planned: number, today: string): number {
  if (week.endsOn < today) return planned;
  if (today < week.startsOn) return 0;
  const length = daysFrom(week.startsOn, week.endsOn) + 1;
  const elapsed = daysFrom(week.startsOn, today) + 1;
  return Math.round((planned * elapsed) / length);
}

function statusOf(
  done: number,
  plannedToDate: number,
  planOver: boolean,
  config: StudyPlanConfig,
): PlanStatus {
  if (planOver) return "finished";
  if (plannedToDate === 0) return "not_started";
  const ratio = done / plannedToDate;
  if (ratio < config.progress.behindBelow) return "behind";
  return ratio > config.progress.aheadAbove ? "ahead" : "on_track";
}
