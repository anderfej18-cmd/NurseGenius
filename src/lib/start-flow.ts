// The rules and wording behind the "start a test" screen, as pure functions. Every limit comes from
// `exam-rules` (the same numbers the server enforces); nothing here scores, selects or counts questions.
import {
  MAX_SESSION_MINUTES,
  MIN_SESSION_MINUTES,
  TIER_DAILY_LIMIT,
  TIER_SESSION_LIMIT,
  type Tier,
} from "./exam-rules";

export const COUNT_STEP = 10;
export const MINUTES_STEP = 5;
export const MINUTES_RANGE = { min: MIN_SESSION_MINUTES, max: MAX_SESSION_MINUTES } as const;

/** The most questions one test may hold for this plan. */
export const sessionLimitFor = (tier: Tier): number => TIER_SESSION_LIMIT[tier];

/** The slider's bounds for the number of questions: steps of ten up to the plan's largest test. */
export function countRange(sessionLimit: number): { min: number; max: number } {
  const max = Math.max(1, sessionLimit);
  return { min: Math.min(COUNT_STEP, max), max };
}

export const defaultCount = (sessionLimit: number): number =>
  Math.min(50, Math.max(1, sessionLimit));

export function clampCount(value: number, sessionLimit: number): number {
  const { min, max } = countRange(sessionLimit);
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** About 72 seconds a question, rounded up to a whole five minutes and kept within the allowed range. */
export function suggestedMinutes(count: number): number {
  const raw = Math.ceil((count * 1.2) / MINUTES_STEP) * MINUTES_STEP;
  return Math.min(MINUTES_RANGE.max, Math.max(MINUTES_RANGE.min, raw));
}

export const secondsPerQuestion = (count: number, minutes: number): number =>
  Math.round((minutes * 60) / Math.max(1, count));

/** A gentle note when the pace is unusual. The server accepts any time in range; this is advice only. */
export function pacingNote(count: number, minutes: number): string | null {
  const seconds = secondsPerQuestion(count, minutes);
  if (seconds < 30)
    return `That is about ${seconds} seconds a question. You will need to move fast.`;
  if (seconds > 180)
    return `That is about ${Math.round(seconds / 60)} minutes a question. You can lower the time.`;
  return null;
}

export interface Allowance {
  /** Questions allowed per day on this plan; null means no daily limit. */
  readonly limit: number | null;
  readonly used: number;
  /** Questions left today; null when there is no limit. */
  readonly remaining: number | null;
}

/** What has been used today. A count from an earlier day does not carry over (the database resets it). */
export function allowanceFor(
  profile: { tier: Tier; questions_today: number; last_question_date: string | null },
  now: Date,
): Allowance {
  const limit = TIER_DAILY_LIMIT[profile.tier];
  const today = now.toISOString().slice(0, 10);
  const used = profile.last_question_date === today ? profile.questions_today : 0;
  return { limit, used, remaining: limit === null ? null : Math.max(0, limit - used) };
}

export interface AllowanceNote {
  readonly tone: "info" | "warning";
  readonly text: string;
}

/** Tells the person how a test of this size sits against what is left today. The database enforces it. */
export function allowanceNote(allowance: Allowance, count: number): AllowanceNote | null {
  if (allowance.remaining === null) return null;
  if (allowance.remaining === 0)
    return {
      tone: "warning",
      text: "You have used today's question allowance. A new test cannot start until tomorrow, or on a larger plan.",
    };
  if (count > allowance.remaining)
    return {
      tone: "warning",
      text: `You have ${allowance.remaining} questions left today. A test of ${count} may be refused; choose ${allowance.remaining} or fewer.`,
    };
  return null;
}

export interface TopicOption {
  readonly topic: string;
  readonly total: number;
}

/** Topics matching what was typed, alphabetical; an empty search keeps them all. */
export function filterTopics(
  counts: Readonly<Record<string, number>>,
  query: string,
): TopicOption[] {
  const needle = query.trim().toLowerCase();
  return Object.entries(counts)
    .filter(([topic, total]) => total > 0 && topic.toLowerCase().includes(needle))
    .map(([topic, total]) => ({ topic, total }))
    .sort((a, b) => a.topic.localeCompare(b.topic));
}

export function programmeSummary(counts: Readonly<Record<string, number>>): {
  topics: number;
  questions: number;
} {
  const entries = Object.values(counts).filter((total) => total > 0);
  return { topics: entries.length, questions: entries.reduce((sum, total) => sum + total, 0) };
}

const plural = (n: number, one: string, many: string): string =>
  `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

export const programmeSummaryText = (counts: Readonly<Record<string, number>>): string => {
  const { topics, questions } = programmeSummary(counts);
  return `${plural(topics, "topic", "topics")}, ${plural(questions, "question", "questions")}`;
};
