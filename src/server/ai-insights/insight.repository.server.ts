import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import type { NewInsight, StoredInsight } from "./insight.service";
import { type InsightKind, narrativeSchema } from "./insight.types";

const rowSchema = z.object({
  facts_hash: z.string().length(64),
  narrative: narrativeSchema,
  generated_at: z.string(),
});

/** The stored explanations, one per student and kind. Service-role client: every query names the student. */
export class SupabaseInsightStore {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async find(userId: string, kind: InsightKind): Promise<StoredInsight | null> {
    const { data, error } = await this.db
      .from("ai_insights")
      .select("facts_hash, narrative, generated_at")
      .eq("user_id", userId)
      .eq("kind", kind)
      .maybeSingle();
    if (error) throw error;
    if (data === null) return null;

    // A cache: a row written under an older shape is simply written again, not a failure.
    const row = rowSchema.safeParse(data);
    if (!row.success) return null;
    return {
      factsHash: row.data.facts_hash,
      narrative: row.data.narrative,
      generatedAt: new Date(row.data.generated_at).toISOString(),
    };
  }

  async save(userId: string, kind: InsightKind, insight: NewInsight): Promise<void> {
    const { error } = await this.db.from("ai_insights").upsert(
      {
        user_id: userId,
        kind,
        facts_hash: insight.factsHash,
        narrative: insight.narrative,
        model: insight.model,
        prompt_version: insight.promptVersion,
        prompt_tokens: insight.promptTokens,
        completion_tokens: insight.completionTokens,
        generated_at: insight.generatedAt,
      },
      { onConflict: "user_id,kind" },
    );
    if (error) throw error;
  }
}
