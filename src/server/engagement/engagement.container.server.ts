import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createIntelligence } from "../intelligence/intelligence.container.server";
import { SupabaseReadinessStore } from "../intelligence/readiness/readiness.repository.server";
import { SupabaseSessionRepository } from "../sessions/session.repository.server";
import { SupabaseDailyChallengeStore } from "./challenges/daily-challenge.repository.server";
import { DailyChallengeService } from "./challenges/daily-challenge.service";
import { SupabaseGamificationStore } from "./gamification/gamification.repository.server";
import { GamificationService } from "./gamification/gamification.service";
import { SupabaseStudyPlanStore } from "./plans/study-plan.repository.server";
import { StudyPlanService } from "./plans/study-plan.service";
import { SupabaseStudyDaysStore } from "./streaks/streak.repository.server";
import { StreakService } from "./streaks/streak.service";

/**
 * Wires the engagement services to the database. The one place their dependencies are chosen
 * (composition root); controllers ask for the graph instead of building their own.
 */
export function createEngagement(
  db: SupabaseClient<Database>,
  clock: () => Date = () => new Date(),
) {
  const streaks = new StreakService({ store: new SupabaseStudyDaysStore(db), clock });
  const gamification = new GamificationService({
    store: new SupabaseGamificationStore(db),
    streaks,
    clock,
  });
  const intelligence = createIntelligence(db, clock);
  const challenges = new DailyChallengeService({
    store: new SupabaseDailyChallengeStore(db),
    pool: new SupabaseSessionRepository(db),
    selection: intelligence.adaptiveSelection,
    clock,
  });
  const plans = new StudyPlanService({
    profile: new SupabaseReadinessStore(db),
    store: new SupabaseStudyPlanStore(db),
    history: intelligence.history,
    mastery: intelligence.mastery,
    time: intelligence.time,
    catalog: intelligence.catalog,
    clock,
  });
  return { streaks, gamification, challenges, plans };
}
