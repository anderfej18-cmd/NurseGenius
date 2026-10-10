import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Read-only counts for the performance analysis. Service-role client: every query names the student. */
export class SupabasePerformanceStore {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async countUnverifiedExams(userId: string): Promise<number> {
    const { count, error } = await this.db
      .from("exams")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "completed")
      .eq("score_verified", false);
    if (error) throw error;
    return count ?? 0;
  }
}
