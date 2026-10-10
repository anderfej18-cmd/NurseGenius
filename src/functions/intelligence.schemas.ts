import { z } from "zod";
import { examTypeSchema } from "@/lib/exam-type";

export const listDueReviewsSchema = z
  .object({
    examType: examTypeSchema.optional(),
    topic: z.string().trim().min(1).max(200).optional(),
    limit: z.number().int().min(1).max(50).optional(),
    offset: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();

export const similarQuestionsSchema = z
  .object({ questionId: z.string().uuid(), limit: z.number().int().min(1).max(20).optional() })
  .strict();

/** Analytics over the whole history, or only the last `periodDays` days. */
export const periodSchema = z
  .object({ periodDays: z.number().int().min(1).max(365).optional() })
  .strict();

export const dailyRecommendationSchema = z
  .object({ availableMinutes: z.number().int().min(10).max(240).optional() })
  .strict();

export const examReadinessSchema = z.object({ examType: examTypeSchema.optional() }).strict();
