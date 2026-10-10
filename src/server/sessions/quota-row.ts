import { z } from "zod";
import type { Quota } from "./session.types";

/** The profile columns a quota is read from; selected by every repository that needs one. */
export const QUOTA_COLUMNS = "tier, expiry_date, questions_today, last_question_date";

const quotaRowSchema = z.object({
  tier: z.enum(["novice", "erudite", "scholar"]),
  expiry_date: z.string().nullable(),
  questions_today: z.number().int().min(0),
  last_question_date: z.string().nullable(),
});

/** A student's tier and daily counter from a profile row. Parsed: a row the schema forbids fails loudly. */
export function quotaFromRow(row: unknown): Quota {
  const parsed = quotaRowSchema.parse(row);
  return {
    tier: parsed.tier,
    expiryDate: parsed.expiry_date,
    questionsToday: parsed.questions_today,
    lastQuestionDate: parsed.last_question_date,
  };
}
