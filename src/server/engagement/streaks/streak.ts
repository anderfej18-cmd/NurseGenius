import { daysUntilDate } from "../../intelligence/utc-days";
import { STREAK_CONFIG, type StreakConfig } from "./streak.config";

/** Answered questions on one UTC day (`YYYY-MM-DD`). */
export interface StudyDay {
  readonly day: string;
  readonly answered: number;
}

export interface StreakReport {
  /** Consecutive study days ending today, or yesterday while today is still to come. */
  readonly current: number;
  /** The longest run in the history read. */
  readonly longest: number;
  readonly studiedToday: boolean;
  /** A streak is running but today has no study yet: it ends tonight if nothing is answered. */
  readonly atRisk: boolean;
  readonly lastStudyDay: string | null;
  readonly daysStudiedLast7: number;
  readonly daysStudiedLast30: number;
  readonly minQuestionsPerDay: number;
  readonly nextMilestone: { readonly days: number; readonly remaining: number } | null;
}

/**
 * The student's study streak from the days they answered questions. Pure: the same days, time and
 * config always give the same report; days are UTC calendar days. Rules in docs/formulas.md
 * (section 10).
 */
export function computeStreak(
  days: readonly StudyDay[],
  now: Date,
  config: StreakConfig = STREAK_CONFIG,
): StreakReport {
  // How many days ago each qualifying day was; the future (clock skew) is ignored.
  const ages = new Set(
    [...totalsByDay(days)]
      .filter(([, answered]) => answered >= config.minQuestionsPerDay)
      .map(([day]) => -(daysUntilDate(day, now) ?? 0))
      .filter((age) => age >= 0),
  );

  const studiedToday = ages.has(0);
  const current = runLength(ages, studiedToday ? 0 : 1);
  const youngest = ages.size === 0 ? null : Math.min(...ages);
  return {
    current,
    longest: longestRun(ages),
    studiedToday,
    atRisk: current > 0 && !studiedToday,
    lastStudyDay: youngest === null ? null : dayBefore(now, youngest),
    daysStudiedLast7: countWithin(ages, 7),
    daysStudiedLast30: countWithin(ages, 30),
    minQuestionsPerDay: config.minQuestionsPerDay,
    nextMilestone: nextMilestone(current, config.milestones),
  };
}

function totalsByDay(days: readonly StudyDay[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const { day, answered } of days) totals.set(day, (totals.get(day) ?? 0) + answered);
  return totals;
}

/** Consecutive days present from `start` days ago backwards in time. */
function runLength(ages: ReadonlySet<number>, start: number): number {
  let length = 0;
  while (ages.has(start + length)) length += 1;
  return length;
}

function longestRun(ages: ReadonlySet<number>): number {
  let longest = 0;
  for (const age of ages) {
    // Count each run once, from its most recent day.
    if (!ages.has(age - 1)) longest = Math.max(longest, runLength(ages, age));
  }
  return longest;
}

const countWithin = (ages: ReadonlySet<number>, days: number): number =>
  [...ages].filter((age) => age < days).length;

function nextMilestone(
  current: number,
  milestones: readonly number[],
): StreakReport["nextMilestone"] {
  const next = milestones.find((milestone) => milestone > current);
  return next === undefined ? null : { days: next, remaining: next - current };
}

const dayBefore = (now: Date, daysAgo: number): string =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo))
    .toISOString()
    .slice(0, 10);
