import { z } from "zod";
import { examTypeSchema } from "@/lib/exam-type";
import { INSIGHT_KINDS } from "@/lib/ai-insights";

/** Which explanation to show. The student is the signed-in one; no id, score or fact is accepted. */
export const getInsightSchema = z
  .object({
    kind: z.enum(INSIGHT_KINDS),
    /** The day's study time, for the recommendation. */
    availableMinutes: z.number().int().min(10).max(240).optional(),
    /** Which exam the readiness is for; the profile's preference when omitted. */
    examType: examTypeSchema.optional(),
  })
  .strict();
