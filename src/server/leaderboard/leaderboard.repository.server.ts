import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import type { LeaderboardRow } from "./leaderboard.service";

// `numeric` columns can arrive as strings; coerce, and refuse anything that is not a number.
const rowSchema = z.object({
  user_id: z.string(),
  username: z.string().nullable(),
  avg_score: z.coerce.number(),
  attempted: z.number().int(),
  correct: z.number().int(),
  active_days: z.number().int().nullish(),
});

/** Reads the two boards with the service role: browsers cannot execute these functions. */
export class SupabaseLeaderboardStore {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async daily(): Promise<LeaderboardRow[]> {
    const { data, error } = await this.db.rpc("get_daily_leaderboard");
    if (error) throw error;
    return parse(data);
  }

  async weekly(): Promise<LeaderboardRow[]> {
    const { data, error } = await this.db.rpc("get_weekly_leaderboard");
    if (error) throw error;
    return parse(data);
  }
}

function parse(data: unknown): LeaderboardRow[] {
  return z
    .array(rowSchema)
    .parse(data)
    .map((row) => ({
      userId: row.user_id,
      username: row.username,
      avgScore: row.avg_score,
      attempted: row.attempted,
      correct: row.correct,
      activeDays: row.active_days ?? null,
    }));
}
