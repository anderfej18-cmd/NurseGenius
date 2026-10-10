import { z } from "zod";
import { examTypeSchema } from "@/lib/exam-type";

export const listMistakesSchema = z
  .object({
    view: z.enum(["all", "most_repeated", "recent", "repeatedly_failed"]).default("all"),
    examType: examTypeSchema.optional(),
    topic: z.string().trim().min(1).max(200).optional(),
    limit: z.number().int().min(1).max(50).optional(),
    offset: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();
