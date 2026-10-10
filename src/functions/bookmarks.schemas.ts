import { z } from "zod";
import { examTypeSchema } from "@/lib/exam-type";

export const addBookmarkSchema = z
  .object({ questionId: z.string().uuid(), note: z.string().max(500).optional() })
  .strict();
export const removeBookmarkSchema = z.object({ questionId: z.string().uuid() }).strict();
export const listBookmarksSchema = z
  .object({
    examType: examTypeSchema.optional(),
    topic: z.string().trim().min(1).max(200).optional(),
    limit: z.number().int().min(1).max(50).optional(),
    offset: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();
