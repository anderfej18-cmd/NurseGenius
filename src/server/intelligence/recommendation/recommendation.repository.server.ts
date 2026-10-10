import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { QUOTA_COLUMNS, quotaFromRow } from "../../sessions/quota-row";
import type { StudyProfile } from "./recommendation.service";

const examDateSchema = z.object({ exam_date: z.string().nullable() });

/** Read-only facts about a student for the daily plan. Service-role client: every query names the student. */
export class SupabaseRecommendationStore {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async countUnresolvedMistakes(userId: string): Promise<number> {
    const { count, error } = await this.db
      .from("user_question_stats")
      .select("question_id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("unresolved", true);
    if (error) throw error;
    return count ?? 0;
  }

  async getStudyProfile(userId: string): Promise<StudyProfile | null> {
    const { data, error } = await this.db
      .from("profiles")
      .select(`exam_date, ${QUOTA_COLUMNS}`)
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    if (data === null) return null;
    return { examDate: examDateSchema.parse(data).exam_date, quota: quotaFromRow(data) };
  }
}
