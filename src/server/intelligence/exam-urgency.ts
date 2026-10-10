export type ExamUrgency = "none" | "low" | "medium" | "high";

export interface UrgencyDays {
  /** Days to the exam at or below which each level applies. */
  readonly high: number;
  readonly medium: number;
  readonly low: number;
}

/** How soon the exam is, from whole days to it; none without a date or once it has passed. */
export function examUrgency(daysToExam: number | null, thresholds: UrgencyDays): ExamUrgency {
  if (daysToExam === null || daysToExam < 0) return "none";
  if (daysToExam <= thresholds.high) return "high";
  if (daysToExam <= thresholds.medium) return "medium";
  if (daysToExam <= thresholds.low) return "low";
  return "none";
}
