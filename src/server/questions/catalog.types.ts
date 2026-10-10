import { z } from "zod";
import type { CursorPage, Difficulty, ExamType } from "../types";
import { examTypeSchema } from "@/lib/exam-type";

export type CatalogStatus = "active" | "retired" | "all";

export interface CatalogFilter {
  examType: ExamType;
  topics?: string[];
  subtopicIds?: string[];
  yearFrom?: number;
  yearTo?: number;
  difficulty?: Difficulty[];
  status?: CatalogStatus;
}

export interface CatalogPageRequest {
  cursor?: string;
  limit?: number;
}

/** What the repository is asked for: the service has already normalised the filter and limit. */
export interface CatalogQuery {
  filter: CatalogFilter & { status: CatalogStatus };
  cursor?: string;
  /** Includes the extra row used to detect a next page. */
  limit: number;
}

/**
 * Question content as stored (DB column names), without the answer key. The schema is the single
 * source of truth: the repository parses every row with it, which also drops any extra column a
 * query might return.
 */
export const catalogRowSchema = z.object({
  id: z.string().uuid(),
  exam_type: examTypeSchema,
  topic: z.string(),
  subtopic_id: z.string().uuid().nullable(),
  year: z.number().int().nullable(),
  difficulty: z.enum(["easy", "medium", "hard"]).nullable(),
  tags: z.array(z.string()),
  status: z.string(),
  source: z.string().nullable(),
  updated_at: z.string(),
  question_text: z.string(),
  option_a: z.string(),
  option_b: z.string(),
  option_c: z.string(),
  option_d: z.string(),
});
export type CatalogRow = z.infer<typeof catalogRowSchema>;

export const catalogRowWithKeySchema = catalogRowSchema.extend({
  correct_answer: z.string(),
  rationale: z.string().nullable(),
});
export type CatalogRowWithKey = z.infer<typeof catalogRowWithKeySchema>;

export type StudentQuestionPage = CursorPage<CatalogRow>;
export type AdminQuestionPage = CursorPage<CatalogRowWithKey>;
