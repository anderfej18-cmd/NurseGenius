import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getConfig } from "../config.server";
import { createEngagement } from "../engagement/engagement.container.server";
import { daysUntilDate } from "../intelligence/utc-days";
import { createIntelligence } from "../intelligence/intelligence.container.server";
import { SupabaseRateLimiter } from "../rate-limit/rate-limiter.repository.server";
import { EdgeInsightNarrator } from "./edge-narrator.server";
import { AI_INSIGHT_CONFIG } from "./insight.config";
import { SupabaseInsightStore } from "./insight.repository.server";
import { AiInsightService } from "./insight.service";
import { performanceFacts } from "./performance.facts";
import { planFacts } from "./plan.facts";
import { readinessFacts } from "./readiness.facts";
import { recommendationFacts } from "./recommendation.facts";

const FUNCTION_PATH = "/functions/v1/ai-insight";

/**
 * Wires the AI explanation service: the engines that measure the student, the store, the limiter and
 * the Edge Function that phrases the facts. The one place these dependencies are chosen.
 */
export function createAiInsights(
  db: SupabaseClient<Database>,
  clock: () => Date = () => new Date(),
): AiInsightService {
  const { supabase } = getConfig();
  const intelligence = createIntelligence(db, clock);
  const engagement = createEngagement(db, clock);
  return new AiInsightService({
    facts: {
      recommendation: async (userId, options) =>
        recommendationFacts(await intelligence.recommendation.today(userId, options)),
      plan: async (userId) => {
        const view = await engagement.plans.get(userId);
        return planFacts(view, view === null ? null : daysUntilDate(view.plan.examDate, clock()));
      },
      performance: async (userId) =>
        performanceFacts(await intelligence.performance.analyze(userId)),
      readiness: async (userId, options) =>
        readinessFacts(await intelligence.readiness.assess(userId, { examType: options.examType })),
    },
    store: new SupabaseInsightStore(db),
    narrator: new EdgeInsightNarrator({
      functionUrl: `${supabase.url.replace(/\/+$/, "")}${FUNCTION_PATH}`,
      serviceRoleKey: supabase.serviceRoleKey,
      timeoutMs: AI_INSIGHT_CONFIG.timeoutMs,
    }),
    limiter: new SupabaseRateLimiter(db),
    clock,
    log: (message, detail) => console.error(`[ai-insight] ${message}`, detail),
  });
}
