// Checks for the "Create live test" form, so what is wrong is said next to the field and "Go live" stays
// disabled until nothing is. The server enforces the same limits (`CUSTOM_TEST_CONFIG`); a test in
// src/server/custom-tests keeps these equal to it.

export const CUSTOM_TEST_LIMITS = {
  questions: { min: 1, max: 250 },
  minutes: { min: 10, max: 180 },
  /** How long a link may stay open, in minutes: 10 minutes to 90 days. */
  windowMinutes: { min: 10, max: 90 * 24 * 60 },
} as const;

export type WindowUnit = "minutes" | "hours" | "days";
const MINUTES_PER_UNIT: Record<WindowUnit, number> = { minutes: 1, hours: 60, days: 1440 };

/** A start time may be this far in the past (clock drift and the time it takes to press the button). */
const START_GRACE_MS = 5 * 60_000;

export interface Schedule {
  /** The `datetime-local` value, in the admin's own time zone; empty when not chosen. */
  startsAt: string;
  windowValue: number;
  windowUnit: WindowUnit;
  durationMinutes: number;
}

export type ScheduleErrors = Partial<Record<"start" | "window" | "duration", string>>;

export const windowMinutes = (value: number, unit: WindowUnit): number =>
  value * MINUTES_PER_UNIT[unit];

/** The moment the link closes: the start plus the live window; null while either is unusable. */
export function windowEnd(schedule: Schedule): Date | null {
  const start = new Date(schedule.startsAt);
  const minutes = windowMinutes(schedule.windowValue, schedule.windowUnit);
  if (schedule.startsAt === "" || !Number.isFinite(start.getTime()) || !Number.isFinite(minutes))
    return null;
  return new Date(start.getTime() + minutes * 60_000);
}

/** One message per schedule field that is wrong; an empty object means the schedule can be saved. */
export function validateSchedule(schedule: Schedule, now: Date): ScheduleErrors {
  const errors: ScheduleErrors = {};
  const { windowMinutes: window, minutes } = CUSTOM_TEST_LIMITS;
  const start = new Date(schedule.startsAt);
  if (schedule.startsAt === "" || !Number.isFinite(start.getTime()))
    errors.start = "Choose when the test opens.";
  else if (start.getTime() < now.getTime() - START_GRACE_MS)
    errors.start = "Choose a start time that is not in the past.";

  const length = windowMinutes(schedule.windowValue, schedule.windowUnit);
  if (!Number.isFinite(length) || length < window.min || length > window.max)
    errors.window = "The test can stay open from 10 minutes to 90 days.";

  if (
    !Number.isInteger(schedule.durationMinutes) ||
    schedule.durationMinutes < minutes.min ||
    schedule.durationMinutes > minutes.max
  )
    errors.duration = `Choose a whole number of minutes from ${minutes.min} to ${minutes.max}.`;

  const end = windowEnd(schedule);
  if (errors.start === undefined && errors.window === undefined && end !== null && end <= now)
    errors.window = "The test would already be over. Make the window longer or start it later.";
  return errors;
}

/** One chosen subcategory: how many questions to draw and how many the bank has in use. */
export interface Allocation {
  topic: string;
  count: number;
  available: number;
}

export interface CustomTestDraft extends Schedule {
  title: string;
  mode: "existing" | "upload";
  allocations: readonly Allocation[];
  /** Upload: how many valid questions the file held (after any random cut to the maximum). */
  uploadedCount: number;
}

export type CustomTestErrors = ScheduleErrors & {
  title?: string;
  topics?: string;
  /** Messages for single subcategories, by name. */
  counts?: Record<string, string>;
  total?: string;
  file?: string;
};

/** How many questions the test will hold. */
export const questionCountOf = (draft: CustomTestDraft): number =>
  draft.mode === "upload"
    ? draft.uploadedCount
    : draft.allocations.reduce((sum, allocation) => sum + allocation.count, 0);

/** One message per field that is wrong; an empty object means the test can go live. */
export function validateCustomTest(draft: CustomTestDraft, now: Date): CustomTestErrors {
  const errors: CustomTestErrors = { ...validateSchedule(draft, now) };
  const { questions } = CUSTOM_TEST_LIMITS;
  if (draft.title.trim() === "") errors.title = "Give the test a title.";

  if (draft.mode === "existing") {
    if (draft.allocations.length === 0) errors.topics = "Choose at least one subcategory.";
    const counts: Record<string, string> = {};
    for (const { topic, count, available } of draft.allocations) {
      if (!Number.isInteger(count) || count < 1) counts[topic] = "Ask for at least 1 question.";
      else if (count > available)
        counts[topic] =
          `Only ${available} ${available === 1 ? "question is" : "questions are"} in use here.`;
    }
    if (Object.keys(counts).length > 0) errors.counts = counts;
  } else if (draft.uploadedCount === 0) {
    errors.file = "Add a .txt file with at least one valid question.";
  }

  const total = questionCountOf(draft);
  if (
    errors.topics === undefined &&
    errors.counts === undefined &&
    errors.file === undefined &&
    (total < questions.min || total > questions.max)
  )
    errors.total = `A test holds ${questions.min} to ${questions.max} questions; this one has ${total}.`;
  return errors;
}

/** Whether any message is left, for the one decision that matters: can the test go live? */
export const hasErrors = (errors: CustomTestErrors | ScheduleErrors): boolean =>
  Object.keys(errors).length > 0;

/**
 * `count` questions picked at random from the pool, each at most once (a Fisher-Yates shuffle of a copy,
 * so the pool is left alone). `random` returns a number from 0 up to but not including 1.
 */
export function sampleQuestions<T>(
  pool: readonly T[],
  count: number,
  random: () => number = Math.random,
): T[] {
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.max(0, count));
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** A date as the `datetime-local` input writes it, in the person's own time zone. */
export const toLocalInput = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** A sensible starting point: opens now, stays open a day, an hour per candidate. */
export const defaultSchedule = (now: Date): Schedule => ({
  startsAt: toLocalInput(now),
  windowValue: 24,
  windowUnit: "hours",
  durationMinutes: 60,
});
