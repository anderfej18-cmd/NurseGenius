// Shared by the report form (browser) and the server, so both agree on the allowed reasons.
export const REPORT_REASONS = [
  "incorrect_answer",
  "bad_question",
  "duplicate",
  "unclear",
  "wrong_topic",
  "typo",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
