// Exam rules shared by the browser (to render limits) and the server (to enforce them).
// Pure data: importable from both sides.

export type Tier = "novice" | "erudite" | "scholar";

/** How each tier is named on screen. */
export const TIER_LABEL: Record<Tier, string> = {
  novice: "Novice",
  erudite: "Erudite",
  scholar: "Scholar",
};

// Daily caps (null = unlimited)
export const TIER_DAILY_LIMIT: Record<Tier, number | null> = {
  novice: 50,
  erudite: 500,
  scholar: null,
};

// Per-session cap (max questions in one quiz)
export const TIER_SESSION_LIMIT: Record<Tier, number> = {
  novice: 50,
  erudite: 150,
  scholar: 250,
};

/** Category value meaning "draw from every topic". */
export const ALL_AREAS = "All Areas";

/** Bounds for the time limit of a session, in minutes. */
export const MIN_SESSION_MINUTES = 5;
export const MAX_SESSION_MINUTES = 180;

/** The most finished tests the history shows (and the dashboard average may draw on). */
export const HISTORY_MAX = 50;
