import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { SupabaseDailyChallengeStore } from "../engagement/challenges/daily-challenge.repository.server";
import { SupabaseSessionRepository } from "../sessions/session.repository.server";
import { secureRandom } from "../sessions/sampling";
import { SupabaseFriendChallengeStore } from "./challenges/friend-challenge.repository.server";
import { FriendChallengeService } from "./challenges/friend-challenge.service";
import { SupabaseFriendStore } from "./friends/friend.repository.server";
import { FriendService } from "./friends/friend.service";

/**
 * Wires the competition services to the database. The one place their dependencies are chosen
 * (composition root); controllers ask for the graph instead of building their own.
 */
export function createCompetition(
  db: SupabaseClient<Database>,
  clock: () => Date = () => new Date(),
  random: () => number = secureRandom,
) {
  const friends = new FriendService({ store: new SupabaseFriendStore(db) });
  const challenges = new FriendChallengeService({
    store: new SupabaseFriendChallengeStore(db),
    profile: new SupabaseDailyChallengeStore(db),
    pool: new SupabaseSessionRepository(db),
    clock,
    random,
  });
  return { friends, challenges };
}
