// Wording and shaping for the dashboard, as pure functions. Every figure comes from a server answer;
// nothing here scores, ranks against a made-up threshold or invents a value.
import type { TrendPoint } from "./chart-geometry";

interface HistoryExam {
  readonly category: string;
  readonly examType: string;
  readonly completedAt: string;
  readonly scorePct: number | null;
  readonly scoreVerified: boolean;
}

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

export const shortDate = (iso: string): string => dateFormat.format(new Date(iso));

/** "Welcome back, Ada" from the name the student chose, falling back to a plain greeting. */
export function greetingTitle(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed ? `Welcome back, ${trimmed}` : "Welcome back";
}

/**
 * The points of the score chart: oldest first, only tests whose stored score the server checked
 * against the answer key (the same rule as the average beside it).
 */
export function scoreTrend(exams: readonly HistoryExam[]): TrendPoint[] {
  return exams
    .filter((exam) => exam.scoreVerified && exam.scorePct !== null)
    .map((exam) => ({
      label: `${shortDate(exam.completedAt)} · ${exam.examType} ${exam.category}`,
      value: exam.scorePct as number,
    }))
    .reverse();
}

/** The date labels under the first and last point of the chart. */
export function trendAxisLabels(exams: readonly HistoryExam[]): { first: string; last: string } {
  const verified = exams.filter((exam) => exam.scoreVerified && exam.scorePct !== null);
  const newest = verified[0];
  const oldest = verified[verified.length - 1];
  return {
    first: oldest ? shortDate(oldest.completedAt) : "",
    last: newest ? shortDate(newest.completedAt) : "",
  };
}

/** Today's use of the daily allowance in words; "no daily limit" on plans without one. */
export function allowanceHeadline(used: number, limit: number | null): string {
  return limit === null ? `${used} today` : `${used} of ${limit}`;
}

export function allowanceCaption(used: number, limit: number | null): string {
  if (limit === null) return "Your plan has no daily limit.";
  const left = Math.max(0, limit - used);
  return left === 0
    ? "You have used today's questions. They reset tomorrow."
    : `${left} ${left === 1 ? "question" : "questions"} left today.`;
}

/** The streak in the fewest words; the full message lives on Study Today. */
export function streakHeadline(days: number): string {
  return days === 1 ? "1 day" : `${days} days`;
}
