import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { examTypeSchema } from "@/lib/exam-type";
import type { Database } from "@/integrations/supabase/types";
import { mapDbError } from "../../db-errors";
import type { ExamType } from "../../types";
import type { ChallengeView } from "./friend-challenge";

const count = z.number().int().min(0);

const viewRowSchema = z.object({
  id: z.string(),
  role: z.enum(["challenger", "opponent"]),
  opponent_username: z.string(),
  exam_type: examTypeSchema,
  total_questions: count,
  created_at: z.coerce.date(),
  expires_at: z.coerce.date(),
  declined_at: z.coerce.date().nullable(),
  my_exam_id: z.string().nullable(),
  my_exam_status: z.string().nullable(),
  my_correct: count.nullable(),
  my_score_pct: z.coerce.number().nullable(),
  my_completed_at: z.coerce.date().nullable(),
  their_exam_status: z.string().nullable(),
  their_correct: count.nullable(),
  their_score_pct: z.coerce.number().nullable(),
  their_completed_at: z.coerce.date().nullable(),
});

/**
 * Friend challenges. Service-role client: the database functions take the student explicitly, check
 * who is in each challenge, and withhold the opponent's result until the student has finished.
 */
export class SupabaseFriendChallengeStore {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async createChallenge(
    userId: string,
    friendshipId: string,
    examType: ExamType,
    questionIds: readonly string[],
    expiresAt: Date,
    maxOpen: number,
  ): Promise<string> {
    const { data, error } = await this.db.rpc("create_friend_challenge", {
      _user_id: userId,
      _friendship_id: friendshipId,
      _exam_type: examType,
      _question_ids: [...questionIds],
      _expires_at: expiresAt.toISOString(),
      _max_open: maxOpen,
    });
    if (error) throw mapDbError(error);
    return z.string().parse(data);
  }

  async declineChallenge(userId: string, challengeId: string): Promise<void> {
    const { error } = await this.db.rpc("decline_friend_challenge", {
      _user_id: userId,
      _challenge_id: challengeId,
    });
    if (error) throw mapDbError(error);
  }

  async startSession(
    userId: string,
    challengeId: string,
    minutes: number,
    today: string,
  ): Promise<string> {
    const { data, error } = await this.db.rpc("start_friend_challenge_session", {
      _user_id: userId,
      _challenge_id: challengeId,
      _time_limit_minutes: minutes,
      _today: today,
    });
    if (error) throw mapDbError(error);
    return z.string().parse(data);
  }

  async getView(userId: string, challengeId: string): Promise<ChallengeView | null> {
    const { data, error } = await this.db.rpc("get_friend_challenge_views", {
      _user_id: userId,
      _challenge_id: challengeId,
      _limit: 1,
      _offset: 0,
    });
    if (error) throw error;
    const [row] = z.array(viewRowSchema).parse(data);
    return row === undefined ? null : toView(row);
  }

  async listViews(
    userId: string,
    page: { limit: number; offset: number },
  ): Promise<ChallengeView[]> {
    const { data, error } = await this.db.rpc("get_friend_challenge_views", {
      _user_id: userId,
      _limit: page.limit,
      _offset: page.offset,
    });
    if (error) throw error;
    return z.array(viewRowSchema).parse(data).map(toView);
  }
}

function toView(row: z.infer<typeof viewRowSchema>): ChallengeView {
  return {
    id: row.id,
    role: row.role,
    opponentUsername: row.opponent_username,
    examType: row.exam_type,
    totalQuestions: row.total_questions,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    declinedAt: row.declined_at,
    myExamId: row.my_exam_id,
    myExamStatus: row.my_exam_status,
    myCorrect: row.my_correct,
    myScorePct: row.my_score_pct,
    myCompletedAt: row.my_completed_at,
    theirExamStatus: row.their_exam_status,
    theirCorrect: row.their_correct,
    theirScorePct: row.their_score_pct,
    theirCompletedAt: row.their_completed_at,
  };
}
