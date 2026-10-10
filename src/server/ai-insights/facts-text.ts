import { AI_INSIGHT_CONFIG } from "./insight.config";

/** Cuts text to a bound at a word edge, so nothing sent to or shown from the model grows without limit. */
export function clip(text: string, max: number): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const edge = cut.lastIndexOf(" ");
  return `${(edge > max / 2 ? cut.slice(0, edge) : cut).trimEnd()}…`;
}

export const fact = (text: string): string => clip(text, AI_INSIGHT_CONFIG.maxFactChars);

/** The exam date as a measured statement, or nothing when the student set none. */
export function examFact(daysToExam: number | null): string | null {
  if (daysToExam === null) return null;
  if (daysToExam < 0) return "Your exam date has passed.";
  if (daysToExam === 0) return "Your exam is today.";
  return `Your exam is in ${daysToExam} ${daysToExam === 1 ? "day" : "days"}.`;
}
