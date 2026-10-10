import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import type { QuestionProgress } from "./adaptive-selector";

const PAGE_SIZE = 1000;

const progressRowSchema = z.object({
  question_id: z.string(),
  attempts: z.number(),
  misses: z.number(),
  unresolved: z.boolean().nullable(),
  next_review_at: z.coerce.date().nullable(),
});

/** A student's per-question statistics. Service-role client: the query names the student itself. */
export class SupabaseQuestionProgressStore {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async listProgress(userId: string): Promise<Map<string, QuestionProgress>> {
    const progress = new Map<string, QuestionProgress>();
    let lastId: string | null = null;
    for (;;) {
      let query = this.db
        .from("user_question_stats")
        .select("question_id, attempts, misses, unresolved, next_review_at")
        .eq("user_id", userId)
        .order("question_id", { ascending: true })
        .limit(PAGE_SIZE);
      if (lastId !== null) query = query.gt("question_id", lastId);
      const { data, error } = await query;
      if (error) throw error;

      const rows = z.array(progressRowSchema).parse(data);
      for (const row of rows) {
        progress.set(row.question_id, {
          attempts: row.attempts,
          misses: row.misses,
          unresolved: row.unresolved ?? false,
          nextReviewAt: row.next_review_at,
        });
      }
      if (rows.length < PAGE_SIZE) return progress;
      lastId = rows[rows.length - 1].question_id;
    }
  }
}
