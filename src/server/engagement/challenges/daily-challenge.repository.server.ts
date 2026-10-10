import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { examTypeSchema } from "@/lib/exam-type";
import type { Database } from "@/integrations/supabase/types";
import { mapDbError } from "../../db-errors";
import { QUOTA_COLUMNS, quotaFromRow } from "../../sessions/quota-row";
import type { Quota } from "../../sessions/session.types";
import type { ExamType } from "../../types";
import type { ChallengeView } from "./daily-challenge.service";

const preferenceSchema = z.object({ exam_preference: z.string().nullable() });

const viewRowSchema = z.object({
  id: z.string(),
  challenge_date: z.string(),
  exam_type: examTypeSchema,
  total_questions: z.number().int().min(0),
  exam_id: z.string().nullable(),
  exam_status: z.string().nullable(),
  correct_count: z.number().int().min(0).nullable(),
  score_pct: z.coerce.number().nullable(),
  completed_at: z.coerce.date().nullable(),
});

/**
 * Reads and writes daily challenges. Service-role client: the database functions take the user id
 * explicitly, so every call names the student.
 */
export class SupabaseDailyChallengeStore {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async getProfile(
    userId: string,
  ): Promise<{ quota: Quota; examPreference: string | null } | null> {
    const { data, error } = await this.db
      .from("profiles")
      .select(`exam_preference, ${QUOTA_COLUMNS}`)
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    if (data === null) return null;
    return {
      quota: quotaFromRow(data),
      examPreference: preferenceSchema.parse(data).exam_preference,
    };
  }

  async getChallengeView(userId: string, date: string): Promise<ChallengeView | null> {
    const { data, error } = await this.db.rpc("get_daily_challenge_view", {
      _user_id: userId,
      _date: date,
    });
    if (error) throw error;
    const [row] = z.array(viewRowSchema).parse(data);
    if (row === undefined) return null;
    return {
      id: row.id,
      challengeDate: row.challenge_date,
      examType: row.exam_type,
      totalQuestions: row.total_questions,
      examId: row.exam_id,
      examStatus: row.exam_status,
      correct: row.correct_count,
      scorePct: row.score_pct,
      completedAt: row.completed_at,
    };
  }

  async createChallenge(
    userId: string,
    date: string,
    examType: ExamType,
    questionIds: readonly string[],
  ): Promise<string> {
    const { data, error } = await this.db.rpc("create_daily_challenge", {
      _user_id: userId,
      _date: date,
      _exam_type: examType,
      _question_ids: [...questionIds],
    });
    if (error) throw mapDbError(error);
    return z.string().parse(data);
  }

  async startChallengeSession(
    userId: string,
    challengeId: string,
    minutes: number,
    today: string,
  ): Promise<string> {
    const { data, error } = await this.db.rpc("start_challenge_session", {
      _user_id: userId,
      _challenge_id: challengeId,
      _time_limit_minutes: minutes,
      _today: today,
    });
    if (error) throw mapDbError(error);
    return z.string().parse(data);
  }
}
