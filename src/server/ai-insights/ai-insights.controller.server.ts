import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { guard } from "../errors";
import { createAiInsights } from "./ai-insights.container.server";
import type { AiInsightService } from "./insight.service";
import type { ExamType } from "../types";
import type { InsightKind } from "./insight.types";

// One instance per Worker isolate, so requests for the same facts can share a single model call.
let service: AiInsightService | undefined;
const insights = (): AiInsightService => (service ??= createAiInsights(supabaseAdmin));

// The user id always comes from the verified JWT (requireSupabaseAuth), never from the request body.
export const aiInsightsController = {
  getInsight: (
    userId: string,
    input: { kind: InsightKind; availableMinutes?: number; examType?: ExamType },
  ) =>
    guard(() =>
      insights().get(userId, input.kind, {
        availableMinutes: input.availableMinutes,
        examType: input.examType,
      }),
    ),
};
