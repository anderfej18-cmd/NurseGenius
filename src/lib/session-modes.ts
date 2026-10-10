// What each kind of study session is, who may start it, and when its answers are shown.
// One place for the rule (docs/api/sessions.md quotes it); a test ties the list to the database's
// allowed `exams.session_type` values. Client-safe: the exam screen builds its choices from it.

export const SESSION_TYPES = [
  "practice",
  "topic_practice",
  "mixed",
  "mistake_review",
  "mock_exam",
  "timed_exam",
  "revision",
  "daily_challenge",
  "custom",
] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

/**
 * When the correct answer and rationale may be sent to the student. Today every mode reveals them
 * only once the session is finished and scored; showing them after each answer would be a product
 * decision (docs/audits/fix-pass.md, "Decisions needed") and has not been built.
 */
export type RevealPolicy = "on_completion";

export type SessionOrigin =
  | "learner" // the student starts it from the exam screen
  | "daily_challenge" // started from the daily challenge
  | "friend_challenge" // started from a friend challenge
  | "not_offered"; // reserved in the database, no screen or function creates it

export interface SessionModeRule {
  readonly label: string;
  readonly origin: SessionOrigin;
  readonly reveal: RevealPolicy;
  readonly summary: string;
}

export const SESSION_MODES = {
  practice: {
    label: "Practice",
    origin: "not_offered",
    reveal: "on_completion",
    summary: "Reserved for per-answer feedback, which has not been decided or built.",
  },
  topic_practice: {
    label: "Topic practice",
    origin: "learner",
    reveal: "on_completion",
    summary: "Questions from one topic, chosen at random or by what the student most needs.",
  },
  mixed: {
    label: "Mixed practice",
    origin: "learner",
    reveal: "on_completion",
    summary: "Questions from every area, chosen at random or by what the student most needs.",
  },
  mistake_review: {
    label: "Mistake review",
    origin: "learner",
    reveal: "on_completion",
    summary: "Questions the student has missed and not yet answered correctly since.",
  },
  mock_exam: {
    label: "Mock exam",
    origin: "not_offered",
    reveal: "on_completion",
    summary: "Sessions finished before this milestone; no screen creates new ones.",
  },
  timed_exam: {
    label: "Timed exam",
    origin: "not_offered",
    reveal: "on_completion",
    summary: "Reserved; every session is already timed.",
  },
  revision: {
    label: "Revision",
    origin: "learner",
    reveal: "on_completion",
    summary: "Questions whose spaced-review date has arrived.",
  },
  daily_challenge: {
    label: "Daily challenge",
    origin: "daily_challenge",
    reveal: "on_completion",
    summary: "The day's fixed set, one per student per UTC day.",
  },
  custom: {
    label: "Custom",
    origin: "friend_challenge",
    reveal: "on_completion",
    summary: "A fixed set agreed with a friend (friend challenge).",
  },
} as const satisfies Record<SessionType, SessionModeRule>;

/** How the server chooses a learner's questions. The client names a mode, never the questions. */
export const SELECTION_MODES = ["random", "adaptive", "mistakes", "due", "similar"] as const;
export type SelectionMode = (typeof SELECTION_MODES)[number];

export const SELECTION_LABELS: Record<SelectionMode, { label: string; hint: string }> = {
  random: { label: "Random", hint: "A random draw from the bank." },
  adaptive: {
    label: "Focus on my weak areas",
    hint: "Weights weak topics, due reviews, past mistakes and unseen questions.",
  },
  mistakes: {
    label: "Review my mistakes",
    hint: "Questions you missed and have not got right since.",
  },
  due: { label: "Revision due today", hint: "Questions whose review date has arrived." },
  similar: {
    label: "Questions similar to one I chose",
    hint: "Questions in the same topic with similar wording, tags and difficulty.",
  },
};

/** The modes a learner picks from a list; "similar" starts from a question, never from this list. */
export const SELECTION_CHOICES = SELECTION_MODES.filter((mode) => mode !== "similar");

/** The session type a learner's selection produces. */
export function sessionTypeFor(
  selection: SelectionMode,
  topic: string | null,
): "topic_practice" | "mixed" | "mistake_review" | "revision" {
  if (selection === "mistakes") return "mistake_review";
  if (selection === "due") return "revision";
  return topic === null ? "mixed" : "topic_practice";
}

/**
 * Why a question is in a session. Stored with the answer row (`exam_answers.selection_reason`, a test
 * keeps the list equal to the database's) and shown on the results page.
 */
export const SELECTION_REASONS = [
  "random",
  "weak_topic",
  "due_review",
  "previous_mistake",
  "new_question",
  "recent_weakness",
  "similar",
] as const;
export type SelectionReason = (typeof SELECTION_REASONS)[number];

const REASON_TEXT: Record<SelectionReason, string> = {
  random: "Chosen at random.",
  weak_topic: "Chosen because this topic is one of your weaker ones.",
  due_review: "Chosen because it was due for review.",
  previous_mistake: "Chosen because you missed it before and have not got it right since.",
  new_question: "Chosen because you have seen it little or never.",
  recent_weakness: "Chosen because your recent answers in this topic were weaker.",
  similar: "Chosen because it is similar to a question you chose to practise.",
};

/** The words for a stored reason; null for a session that kept none. */
export function selectionReasonText(reason: string | null): string | null {
  return reason !== null && reason in REASON_TEXT ? REASON_TEXT[reason as SelectionReason] : null;
}
