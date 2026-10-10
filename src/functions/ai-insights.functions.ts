import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getInsightSchema } from "./ai-insights.schemas";
import { validated } from "./validated";

// Client-safe module (AGENTS.md): server code is loaded with a dynamic import inside each handler.

/**
 * A plain-words explanation of the signed-in student's measured recommendation or readiness. The numbers
 * are computed from their own records; the model only phrases them, and a computed summary is returned
 * whenever the AI text is unavailable. POST because a first view may write the explanation.
 */
export const getAiInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(getInsightSchema))
  .handler(async ({ data, context }) => {
    const { aiInsightsController } =
      await import("@/server/ai-insights/ai-insights.controller.server");
    return aiInsightsController.getInsight(context.userId, data);
  });
