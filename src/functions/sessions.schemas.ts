import { z } from "zod";
import { HISTORY_MAX, MAX_SESSION_MINUTES, MIN_SESSION_MINUTES } from "@/lib/exam-rules";
import { examTypeSchema } from "@/lib/exam-type";
import { SELECTION_MODES } from "@/lib/session-modes";

// `.strict()` everywhere: unknown keys (a forged score, correctness flag, user id or question list)
// are rejected rather than silently ignored, so tampering is visible in the response.
const id = z.string().uuid();

export const startSessionSchema = z
  .object({
    examType: examTypeSchema,
    category: z.string().trim().min(1).max(200),
    count: z.number().int().min(1).max(250),
    minutes: z.number().int().min(MIN_SESSION_MINUTES).max(MAX_SESSION_MINUTES),
    // A mode, never a list of questions: the server decides which ones.
    selection: z.enum(SELECTION_MODES).optional(),
    // The question to find similar ones to; required for, and only for, the similar mode.
    similarTo: id.optional(),
  })
  .strict()
  .refine((value) => (value.selection === "similar") === (value.similarTo !== undefined), {
    message: "similarTo goes with the similar selection, and only with it.",
    path: ["similarTo"],
  });

export const historySchema = z
  .object({ limit: z.number().int().min(1).max(HISTORY_MAX).optional() })
  .strict();

export const examIdSchema = z.object({ examId: id }).strict();

export const saveAnswerSchema = z
  .object({
    examId: id,
    questionId: id,
    answer: z.enum(["A", "B", "C", "D"]).optional(),
    confidence: z.enum(["low", "medium", "high"]).optional(),
    flagged: z.boolean().optional(),
    // An event ("a hint was shown"), never a total: the database adds one per report.
    hintUsed: z.literal(true).optional(),
    timeSpentMs: z.number().int().min(0).max(3_600_000).optional(),
  })
  .strict();
