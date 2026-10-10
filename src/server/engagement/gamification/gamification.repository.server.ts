import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import type { AchievementUnlock } from "./achievements";
import type { SessionCounters, XpLedgerEntry } from "./gamification.service";
import type { ChallengeXpFacts, SessionXpFacts, XpEventDraft } from "./xp";

const sessionRowSchema = z.object({
  exam_id: z.string(),
  completed_at: z.coerce.date(),
  session_type: z.string(),
  answered: z.number().int().min(0),
  correct: z.number().int().min(0),
  first_correct: z.number().int().min(0),
});

const countersSchema = z.object({
  sessions_completed: z.number().int().min(0),
  questions_answered: z.number().int().min(0),
  correct_answers: z.number().int().min(0),
  perfect_sessions: z.number().int().min(0),
  topics_practised: z.number().int().min(0),
  daily_challenges_completed: z.number().int().min(0),
});

const challengeRowSchema = z.object({
  challenge_id: z.string(),
  completed_at: z.coerce.date(),
  correct_count: z.number().int().min(0),
  total_questions: z.number().int().min(0),
});

const achievementRowSchema = z.object({ code: z.string(), unlocked_at: z.coerce.date() });

const ledgerRowSchema = z.object({
  source_type: z.enum([
    "session",
    "daily_practice",
    "perfect_session",
    "achievement",
    "daily_challenge",
    "duel",
  ]),
  source_id: z.string(),
  xp: z.number().int().min(0),
  occurred_at: z.coerce.date(),
});

/**
 * Reads and writes the XP ledger and achievements. Service-role client: the database functions take
 * the user id explicitly, so every call names the student; nothing here takes an amount from a client.
 */
export class SupabaseGamificationStore {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async listUnawardedSessions(userId: string, limit: number): Promise<SessionXpFacts[]> {
    const { data, error } = await this.db.rpc("get_unawarded_sessions", {
      _user_id: userId,
      _limit: limit,
    });
    if (error) throw error;
    return z
      .array(sessionRowSchema)
      .parse(data)
      .map((row) => ({
        examId: row.exam_id,
        completedAt: row.completed_at,
        sessionType: row.session_type,
        answered: row.answered,
        correct: row.correct,
        firstCorrect: row.first_correct,
      }));
  }

  async listUnpaidChallenges(userId: string, limit: number): Promise<ChallengeXpFacts[]> {
    const { data, error } = await this.db.rpc("get_unpaid_daily_challenges", {
      _user_id: userId,
      _limit: limit,
    });
    if (error) throw error;
    return z
      .array(challengeRowSchema)
      .parse(data)
      .map((row) => ({
        challengeId: row.challenge_id,
        completedAt: row.completed_at,
        correct: row.correct_count,
        total: row.total_questions,
      }));
  }

  async recordXpEvents(userId: string, events: readonly XpEventDraft[]): Promise<number> {
    const { data, error } = await this.db.rpc("record_xp_events", {
      _user_id: userId,
      _events: events.map((event) => ({
        source_type: event.sourceType,
        source_id: event.sourceId,
        xp: event.xp,
        occurred_at: event.occurredAt.toISOString(),
      })),
    });
    if (error) throw error;
    return z.number().int().parse(data);
  }

  async getTotalXp(userId: string): Promise<number> {
    const { data, error } = await this.db.rpc("get_xp_total", { _user_id: userId });
    if (error) throw error;
    return z.coerce.number().parse(data);
  }

  async getCounters(
    userId: string,
    thresholds: { perfectMinAnswered: number; topicMinAttempts: number },
  ): Promise<SessionCounters> {
    const { data, error } = await this.db.rpc("get_engagement_snapshot", {
      _user_id: userId,
      _perfect_min_answered: thresholds.perfectMinAnswered,
      _topic_min_attempts: thresholds.topicMinAttempts,
    });
    if (error) throw error;
    return countersSchema.parse(data);
  }

  async listAchievements(userId: string): Promise<Array<{ code: string; unlockedAt: Date }>> {
    const { data, error } = await this.db
      .from("user_achievements")
      .select("code, unlocked_at")
      .eq("user_id", userId)
      .order("unlocked_at", { ascending: true });
    if (error) throw error;
    return z
      .array(achievementRowSchema)
      .parse(data)
      .map((row) => ({ code: row.code, unlockedAt: row.unlocked_at }));
  }

  async unlockAchievements(
    userId: string,
    unlocks: ReadonlyArray<AchievementUnlock & { unlockedAt: Date }>,
  ): Promise<string[]> {
    const { data, error } = await this.db.rpc("unlock_achievements", {
      _user_id: userId,
      _unlocks: unlocks.map((unlock) => ({
        code: unlock.code,
        xp: unlock.xp,
        unlocked_at: unlock.unlockedAt.toISOString(),
      })),
    });
    if (error) throw error;
    return z.array(z.string()).parse(data);
  }

  /** Newest first. */
  async listXpEvents(
    userId: string,
    page: { limit: number; offset: number },
  ): Promise<XpLedgerEntry[]> {
    const { data, error } = await this.db
      .from("xp_events")
      .select("source_type, source_id, xp, occurred_at")
      .eq("user_id", userId)
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .range(page.offset, page.offset + page.limit - 1);
    if (error) throw error;
    return z
      .array(ledgerRowSchema)
      .parse(data)
      .map((row) => ({
        sourceType: row.source_type,
        sourceId: row.source_id,
        xp: row.xp,
        occurredAt: row.occurred_at,
      }));
  }
}
