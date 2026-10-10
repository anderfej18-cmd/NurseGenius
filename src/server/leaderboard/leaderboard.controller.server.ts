import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { guard } from "../errors";
import { SupabaseLeaderboardStore } from "./leaderboard.repository.server";
import { type LeaderboardPeriod, LeaderboardService } from "./leaderboard.service";

const service = () =>
  new LeaderboardService({ store: new SupabaseLeaderboardStore(supabaseAdmin) });

// The user id always comes from the verified JWT (requireSupabaseAuth), never from the request body.
export const leaderboardController = {
  get: (userId: string, input: { period: LeaderboardPeriod }) =>
    guard(() => service().get(userId, input)),
};
