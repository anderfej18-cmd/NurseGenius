// The rules and wording of the screen where a test is taken, as pure functions. The server owns the
// clock, the answers and the score; these only turn what it sent into what the screen shows. The one
// screen-only rule, "Submit unlocks at 80% answered or 80% of the time", lives here and is documented
// in docs/api/sessions.md (the server does not enforce it).

export const SUBMIT_UNLOCK_SHARE = 0.8;
export const OPTION_LETTERS = ["A", "B", "C", "D"] as const;
export type OptionLetter = (typeof OPTION_LETTERS)[number];

export interface ClockFace {
  readonly minutes: string;
  readonly seconds: string;
}

/** Whole seconds left until the deadline, never below zero. `nowMs` is already corrected to server time. */
export function remainingSeconds(deadlineAt: string, nowMs: number): number {
  return Math.max(0, Math.floor((new Date(deadlineAt).getTime() - nowMs) / 1000));
}

export function clockFace(totalSeconds: number): ClockFace {
  const safe = Math.max(0, Math.floor(totalSeconds));
  return {
    minutes: String(Math.floor(safe / 60)).padStart(2, "0"),
    seconds: String(safe % 60).padStart(2, "0"),
  };
}

/** Share of the time limit that has passed, 0 to 1 and beyond. */
export function elapsedShare(startedAt: string, limitMinutes: number, nowMs: number): number {
  const total = limitMinutes * 60;
  if (total <= 0) return 0;
  return Math.floor((nowMs - new Date(startedAt).getTime()) / 1000) / total;
}

/** Questions that must be answered to unlock Submit before the time condition applies. */
export const answersNeededToSubmit = (total: number): number =>
  Math.ceil(total * SUBMIT_UNLOCK_SHARE);

export function submitUnlocked(input: {
  answered: number;
  total: number;
  startedAt: string;
  limitMinutes: number;
  nowMs: number;
}): boolean {
  const answeredShare = input.total === 0 ? 0 : input.answered / input.total;
  return (
    answeredShare >= SUBMIT_UNLOCK_SHARE ||
    elapsedShare(input.startedAt, input.limitMinutes, input.nowMs) >= SUBMIT_UNLOCK_SHARE
  );
}

export const submitLockedText = (total: number): string =>
  `Submit unlocks when ${answersNeededToSubmit(total)} questions are answered or 80% of the time has passed.`;

/** The shared-test rule, which the database enforces: before time is up, 80% must be answered to submit. */
export const sharedSubmitLockedText = (total: number): string =>
  `Submit unlocks when ${answersNeededToSubmit(total)} questions are answered, or when time runs out.`;

export interface ItemFlags {
  readonly answered: boolean;
  readonly flagged: boolean;
}

export interface TestCounts {
  readonly total: number;
  readonly answered: number;
  readonly unanswered: number;
  readonly flagged: number;
}

export function countItems(items: readonly ItemFlags[]): TestCounts {
  const answered = items.filter((item) => item.answered).length;
  return {
    total: items.length,
    answered,
    unanswered: items.length - answered,
    flagged: items.filter((item) => item.flagged).length,
  };
}

export type NavigatorState = "answered" | "unanswered";

/** The words a screen reader gets for one cell of the question navigator. */
export function navigatorLabel(index: number, item: ItemFlags, current: boolean): string {
  const parts = [`Question ${index + 1}`, item.answered ? "answered" : "not answered"];
  if (item.flagged) parts.push("flagged");
  if (current) parts.push("current");
  return parts.join(", ");
}

export type TimeMilestone = 600 | 300 | 60;

/** The warning to announce when the clock crosses ten minutes, five minutes or one minute left. */
export function milestoneCrossed(previous: number, next: number): TimeMilestone | null {
  for (const milestone of [600, 300, 60] as const) {
    if (previous > milestone && next <= milestone) return milestone;
  }
  return null;
}

export const milestoneText = (milestone: TimeMilestone): string =>
  milestone === 60 ? "One minute left." : `${milestone / 60} minutes left.`;

/** A, B, C or D from a key press (either case); anything else is not an answer. */
export function optionForKey(key: string): OptionLetter | null {
  const upper = key.length === 1 ? key.toUpperCase() : "";
  return (OPTION_LETTERS as readonly string[]).includes(upper) ? (upper as OptionLetter) : null;
}

/** Keys typed into a field must never act as exam shortcuts. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/** Confirmation wording for the submit dialog: what is still open, said plainly. */
export function submitSummaryText(counts: TestCounts): string {
  const open: string[] = [];
  if (counts.unanswered > 0)
    open.push(
      `${counts.unanswered} ${counts.unanswered === 1 ? "question is" : "questions are"} not answered`,
    );
  if (counts.flagged > 0)
    open.push(
      `${counts.flagged} ${counts.flagged === 1 ? "question is" : "questions are"} flagged`,
    );
  const answered = `You have answered ${counts.answered} of ${counts.total}.`;
  return open.length === 0 ? answered : `${answered} ${open.join(" and ")}.`;
}
