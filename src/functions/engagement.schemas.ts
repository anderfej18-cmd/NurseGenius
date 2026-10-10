import { z } from "zod";
import { examTypeSchema } from "@/lib/exam-type";

export const xpHistorySchema = z
  .object({
    limit: z.number().int().min(1).max(50).optional(),
    offset: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();

/** The student's exam date. The student is the signed-in one; whether the date is allowed is checked by the service. */
export const examDateSchema = z
  .object({ examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
  .strict();

export const dailyChallengeSchema = z.object({ examType: examTypeSchema.optional() }).strict();

/**
 * The settings of a new study plan. The exam date is the profile's and the topics are the bank's, so
 * the request cannot supply either. The ranges mirror `STUDY_PLAN_CONFIG` (a test keeps them equal).
 */
export const studyPlanSchema = z
  .object({
    examType: examTypeSchema.optional(),
    dailyMinutes: z.number().int().min(10).max(240).optional(),
    daysPerWeek: z.number().int().min(1).max(7).optional(),
    targetScore: z.number().int().min(50).max(100).optional(),
  })
  .strict();
