import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { MistakeRepository } from "./mistake.service";
import type { MistakeQuery, MistakeRow } from "./mistake.types";

/**
 * Reads a student's per-question statistics joined to question content. Service-role client:
 * every query filters by `user_id` itself. No question rows are duplicated into another table.
 */
export class SupabaseMistakeRepository implements MistakeRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async list(
    userId: string,
    { spec, examType, topic, limit, offset }: MistakeQuery,
  ): Promise<MistakeRow[]> {
    let query = this.db
      .from("user_question_stats")
      .select(
        "question_id, misses, attempts, correct, last_missed_at, last_answer, unresolved, questions!inner(id, exam_type, topic, question_text, option_a, option_b, option_c, option_d, correct_answer, rationale)",
      )
      .eq("user_id", userId)
      .gte("misses", spec.minMisses);
    if (spec.unresolvedOnly) query = query.eq("unresolved", true);
    if (spec.since !== null) query = query.gte("last_missed_at", spec.since);
    if (examType !== undefined) query = query.eq("questions.exam_type", examType);
    if (topic !== undefined) query = query.eq("questions.topic", topic);

    query =
      spec.sort === "most_missed"
        ? query.order("misses", { ascending: false }).order("last_missed_at", { ascending: false })
        : query.order("last_missed_at", { ascending: false });
    const { data, error } = await query
      .order("question_id", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    return data.map((row) => ({
      questionId: row.question_id,
      misses: row.misses,
      attempts: row.attempts,
      correct: row.correct,
      lastMissedAt: row.last_missed_at,
      lastAnswer: row.last_answer,
      unresolved: row.unresolved ?? false,
      question: row.questions,
    }));
  }

  async activeSessionQuestionIds(userId: string): Promise<string[]> {
    const { data, error } = await this.db
      .from("exam_answers")
      .select("question_id, exams!inner(user_id, status)")
      .eq("exams.user_id", userId)
      .eq("exams.status", "in_progress");
    if (error) throw error;
    return data.map((row) => row.question_id);
  }
}
