export type { ExamType } from "@/lib/exam-type";
export type Difficulty = "easy" | "medium" | "hard";

/** Offset pagination for per-student lists, which are bounded by the student's own activity. */
export interface OffsetPage<T> {
  items: T[];
  nextOffset: number | null;
}

/** Keyset pagination for the shared question bank. */
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export const MAX_OFFSET = 10_000;
