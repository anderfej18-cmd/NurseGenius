// Small pure helpers for the admin screens, kept out of the components so they are tested.

import { TIER_DAILY_LIMIT, TIER_LABEL, TIER_SESSION_LIMIT, type Tier } from "./exam-rules";

/** "a, b ,, A" → ["a", "b"]: trimmed, blanks dropped, repeats (any case) dropped, order kept. */
export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of text.split(",")) {
    const tag = raw.trim();
    const key = tag.toLowerCase();
    if (tag === "" || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

export const formatTags = (tags: readonly string[]): string => tags.join(", ");

export type Difficulty = "easy" | "medium" | "hard";

/** The select's text as a difficulty; anything else (the "not set" option) is null. */
export function toDifficulty(value: string): Difficulty | null {
  return value === "easy" || value === "medium" || value === "hard" ? value : null;
}

interface Editable {
  readonly difficulty: Difficulty | null;
  readonly tags: readonly string[];
  readonly subtopicId: string | null;
}

/** The fields of an edit that differ from the original, so a save sends no more than the admin changed. */
type Changes = Partial<{
  difficulty: Difficulty | null;
  tags: string[];
  subtopicId: string | null;
}>;

export function changedFields(original: Editable, edited: Editable): Changes {
  const changes: Changes = {};
  if (edited.difficulty !== original.difficulty) changes.difficulty = edited.difficulty;
  if (edited.subtopicId !== original.subtopicId) changes.subtopicId = edited.subtopicId;
  if (
    edited.tags.length !== original.tags.length ||
    edited.tags.some((tag, i) => tag !== original.tags[i])
  ) {
    changes.tags = [...edited.tags];
  }
  return changes;
}

/** The tiers in rank order, as the user lists show them. */
export const TIERS: readonly Tier[] = ["novice", "erudite", "scholar"];

/** What a tier allows, from the same rules the server enforces: "500 a day, 150 per test". */
export function tierAllowance(tier: Tier): string {
  const daily = TIER_DAILY_LIMIT[tier];
  return `${daily === null ? "Unlimited" : daily} a day, ${TIER_SESSION_LIMIT[tier]} per test`;
}

/** A tier as a choice in a menu: its name and what it allows. */
export const tierChoiceLabel = (tier: Tier): string =>
  `${TIER_LABEL[tier]} (${tierAllowance(tier)})`;

/** Naira with thousands separators: ₦12,500. */
export const formatNaira = (amount: number): string => `₦${Number(amount).toLocaleString("en-NG")}`;

interface Payment {
  readonly user_id: string;
  readonly plan_name: string;
  readonly amount_ngn: number;
}

/** The headline figures of a payment list: who paid, how often for each plan (by lower-case name), and the total collected. */
export function summarizePayments(payments: readonly Payment[]) {
  const purchases: Record<string, number> = {};
  let collected = 0;
  for (const payment of payments) {
    const plan = payment.plan_name.toLowerCase();
    purchases[plan] = (purchases[plan] ?? 0) + 1;
    collected += Number(payment.amount_ngn ?? 0);
  }
  return {
    students: new Set(payments.map((payment) => payment.user_id)).size,
    purchases,
    collected,
  };
}

interface FinishedExam {
  readonly user_id: string;
  readonly score_pct: number | null;
}

/** Each person's average score and how many finished tests it rests on; exams with no score are left out. */
export function averageScores(
  exams: readonly FinishedExam[],
): Record<string, { average: number; tests: number }> {
  const totals: Record<string, { sum: number; tests: number }> = {};
  for (const exam of exams) {
    if (exam.score_pct === null) continue;
    const entry = (totals[exam.user_id] ??= { sum: 0, tests: 0 });
    entry.sum += Number(exam.score_pct);
    entry.tests += 1;
  }
  return Object.fromEntries(
    Object.entries(totals).map(([id, { sum, tests }]) => [id, { average: sum / tests, tests }]),
  );
}

/** People whose username or email contains the text (any case); everyone when the text is blank. */
export function matchesUser(
  user: { readonly username: string | null; readonly email: string | null },
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  return (
    (user.username ?? "").toLowerCase().includes(needle) ||
    (user.email ?? "").toLowerCase().includes(needle)
  );
}

export interface PlanDraft {
  readonly price_ngn: number;
  readonly duration_days: number;
}

/** What is wrong with a plan's price or length, if anything: the price must be above zero and the length a whole number of days above zero. */
export function planDraftErrors(plan: PlanDraft): { price?: string; days?: string } {
  const errors: { price?: string; days?: string } = {};
  if (!Number.isFinite(plan.price_ngn) || plan.price_ngn <= 0)
    errors.price = "Enter a price above 0.";
  if (!Number.isInteger(plan.duration_days) || plan.duration_days <= 0)
    errors.days = "Enter a whole number of days, above 0.";
  return errors;
}

export interface DestinationDraft {
  readonly mode: "existing" | "new";
  /** The subcategory picked from the list; it may belong to the other exam type. */
  readonly existing: string;
  readonly newName: string;
}

/**
 * The subcategory questions will be added to: the new name typed, or the one picked from `topics`. A pick
 * that is not in the list (the exam type changed under it) falls back to the first topic, never to a
 * topic of the other exam. Empty when there is nothing to add to yet.
 */
export function destinationTopic(draft: DestinationDraft, topics: readonly string[]): string {
  if (draft.mode === "new") return draft.newName.trim();
  return topics.includes(draft.existing) ? draft.existing : (topics[0] ?? "");
}
