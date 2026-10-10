const DAY_MS = 24 * 60 * 60 * 1000;

const utcMidnight = (date: Date): number =>
  Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

/** The UTC calendar day of a moment, as YYYY-MM-DD. */
export const utcDate = (date: Date): string => date.toISOString().slice(0, 10);

/** Whole UTC calendar days from `from` to `to`; negative when `to` is earlier. */
export const daysBetweenUtc = (from: Date, to: Date): number =>
  Math.round((utcMidnight(to) - utcMidnight(from)) / DAY_MS);

/** Whole days from today (UTC) to a YYYY-MM-DD date; null without one. */
export function daysUntilDate(date: string | null, now: Date): number | null {
  return date === null ? null : daysBetweenUtc(now, new Date(`${date}T00:00:00.000Z`));
}
