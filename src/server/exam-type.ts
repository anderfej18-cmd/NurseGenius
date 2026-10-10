import { type ExamType, examTypeSchema } from "@/lib/exam-type";
import { ValidationError } from "./errors";

/**
 * The exam a request is about: the one asked for, else the one in the student's profile. A profile
 * that says "Both" (or nothing) cannot decide, so the student is asked to choose.
 */
export function resolveExamType(
  requested: ExamType | undefined,
  preference: string | null,
): ExamType {
  if (requested !== undefined) return requested;
  const fromProfile = examTypeSchema.safeParse(preference);
  if (fromProfile.success) return fromProfile.data;
  throw new ValidationError("Choose RN or RM first.");
}
