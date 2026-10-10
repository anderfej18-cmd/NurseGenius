import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import type { ReviewStore } from "./review.service";
import type { DueQuery, DueReviewRow, SavedReviewState } from "./review.types";
import { examTypeSchema } from "@/lib/exam-type";

/** The most states `apply_review_states` accepts in one call. */
const STATES_PER_CALL = 1000;

const dueRowSchema = z.object({
  question_id: z.string(),
  next_review_at: z.coerce.date(),
  review_status: z.enum(["new", "learning", "review", "mastered"]),
  review_count: z.number(),
  interval_days: z.coerce.number(),
  questions: z.object({
    exam_type: examTypeSchema,
    topic: z.string(),
    question_text: z.string(),
    option_a: z.string(),
    option_b: z.string(),
    option_c: z.string(),
    option_d: z.string(),
  }),
});

/**
 * Storage for review schedules. Service-role client: every query filters by `user_id` itself, and
 * question content is selected column by column, never including the answer key.
 */
export class SupabaseReviewStore implements ReviewStore {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async staleQuestionIds(userId: string, limit: number): Promise<string[]> {
    const { data, error } = await this.db
      .from("user_question_stats")
      .select("question_id")
      .eq("user_id", userId)
      .eq("review_stale", true)
      .order("question_id", { ascending: true })
      .limit(limit);
    if (error) throw error;
    return data.map((row) => row.question_id);
  }

  async saveStates(userId: string, states: readonly SavedReviewState[]): Promise<void> {
    for (let start = 0; start < states.length; start += STATES_PER_CALL) {
      const { error } = await this.db.rpc("apply_review_states", {
        _user_id: userId,
        _states: states.slice(start, start + STATES_PER_CALL).map(toRow),
      });
      if (error) throw error;
    }
  }

  async listDue(
    userId: string,
    { now, examType, topic, limit, offset }: DueQuery,
  ): Promise<DueReviewRow[]> {
    let query = this.db
      .from("user_question_stats")
      .select(
        "question_id, next_review_at, review_status, review_count, interval_days, questions!inner(exam_type, topic, question_text, option_a, option_b, option_c, option_d)",
      )
      .eq("user_id", userId)
      .lte("next_review_at", now.toISOString())
      .eq("questions.status", "active");
    if (examType !== undefined) query = query.eq("questions.exam_type", examType);
    if (topic !== undefined) query = query.eq("questions.topic", topic);

    const { data, error } = await query
      .order("next_review_at", { ascending: true })
      .order("question_id", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    return z
      .array(dueRowSchema)
      .parse(data)
      .map((row) => ({
        questionId: row.question_id,
        nextReviewAt: row.next_review_at,
        status: row.review_status,
        reviewCount: row.review_count,
        intervalDays: row.interval_days,
        question: row.questions,
      }));
  }

  async countDue(userId: string, now: Date): Promise<number> {
    const { count, error } = await this.db
      .from("user_question_stats")
      .select("question_id", { count: "exact", head: true })
      .eq("user_id", userId)
      .lte("next_review_at", now.toISOString());
    if (error) throw error;
    return count ?? 0;
  }
}

function toRow(state: SavedReviewState) {
  return {
    question_id: state.questionId,
    next_review_at: state.nextReviewAt.toISOString(),
    review_count: state.reviewCount,
    last_reviewed_at: state.lastReviewedAt.toISOString(),
    review_status: state.status,
    interval_days: state.intervalDays,
    ease: state.ease,
  };
}
