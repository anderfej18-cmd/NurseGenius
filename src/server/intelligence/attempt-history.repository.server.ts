import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import type { AttemptRecord } from "./attempt.types";
import { DIFFICULTY_STATS_BATCH, MAX_ATTEMPTS_ANALYSED } from "./intelligence.config";
import { examTypeSchema } from "@/lib/exam-type";

// The shape `get_student_attempts` returns. Parsed, not cast: a row the database should never
// produce fails loudly instead of skewing a score.
const attemptRowSchema = z.object({
  question_id: z.string(),
  topic: z.string(),
  exam_type: examTypeSchema,
  session_id: z.string(),
  session_type: z.string(),
  correct: z.boolean(),
  answered_at: z.coerce.date(),
  difficulty: z.enum(["easy", "medium", "hard"]).nullable(),
  confidence: z.enum(["low", "medium", "high"]).nullable(),
  time_spent_ms: z.number().nullable(),
});

const questionStatsRowSchema = z.object({
  question_id: z.string(),
  attempts: z.number(),
  correct: z.number(),
});

export interface QuestionOutcomeCounts {
  readonly attempts: number;
  readonly correct: number;
}

/**
 * Reads attempt history for the engines. Service-role client: the functions it calls take the user
 * id explicitly, so every call names the student whose history is read.
 */
export class AttemptHistoryRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  /** The student's answered attempts, newest first, at most `limit` (default MAX_ATTEMPTS_ANALYSED). */
  async list(
    userId: string,
    options: { since?: Date; questionIds?: readonly string[]; limit?: number } = {},
  ): Promise<AttemptRecord[]> {
    const { data, error } = await this.db.rpc("get_student_attempts", {
      _user_id: userId,
      _since: options.since?.toISOString(),
      _question_ids: options.questionIds === undefined ? undefined : [...options.questionIds],
      _limit: options.limit ?? MAX_ATTEMPTS_ANALYSED,
    });
    if (error) throw error;

    return z
      .array(attemptRowSchema)
      .parse(data)
      .map((row) => ({
        questionId: row.question_id,
        topic: row.topic,
        examType: row.exam_type,
        sessionId: row.session_id,
        sessionType: row.session_type,
        correct: row.correct,
        answeredAt: row.answered_at,
        difficulty: row.difficulty,
        confidence: row.confidence,
        timeSpentMs: row.time_spent_ms,
      }));
  }

  /** Attempts and correct answers per question across all students; questions nobody answered are absent. */
  async questionStats(questionIds: readonly string[]): Promise<Map<string, QuestionOutcomeCounts>> {
    const stats = new Map<string, QuestionOutcomeCounts>();
    for (let start = 0; start < questionIds.length; start += DIFFICULTY_STATS_BATCH) {
      const { data, error } = await this.db.rpc("get_question_difficulty_stats", {
        _question_ids: questionIds.slice(start, start + DIFFICULTY_STATS_BATCH),
      });
      if (error) throw error;
      for (const row of z.array(questionStatsRowSchema).parse(data)) {
        stats.set(row.question_id, { attempts: row.attempts, correct: row.correct });
      }
    }
    return stats;
  }
}
