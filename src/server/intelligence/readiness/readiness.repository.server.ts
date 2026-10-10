import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import type {
  NewReadinessSnapshot,
  ReadinessProfile,
  ReadinessSnapshot,
} from "./readiness.service";

const profileRowSchema = z.object({
  exam_date: z.string().nullable(),
  exam_preference: z.string().nullable(),
});

const snapshotRowSchema = z.object({
  assessed_at: z.string(),
  score: z.coerce.number().nullable(),
  attempts: z.number().int(),
});

/** Facts about a student for the readiness report, and the history of their assessments. Service-role client: the query names the student. */
export class SupabaseReadinessStore {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async getReadinessProfile(userId: string): Promise<ReadinessProfile | null> {
    const { data, error } = await this.db
      .from("profiles")
      .select("exam_date, exam_preference")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    if (data === null) return null;

    const row = profileRowSchema.parse(data);
    return { examDate: row.exam_date, examPreference: row.exam_preference };
  }

  /** Keeps the assessment if the evidence changed, and returns the latest two, newest first. */
  async recordSnapshot(
    userId: string,
    snapshot: NewReadinessSnapshot,
  ): Promise<readonly ReadinessSnapshot[]> {
    const { data, error } = await this.db.rpc("record_readiness_snapshot", {
      _user_id: userId,
      _exam_type: snapshot.examType,
      _score: snapshot.score ?? undefined,
      _band: snapshot.band,
      _attempts: snapshot.attempts,
      _completeness: snapshot.completeness,
      _components: snapshot.components,
    });
    if (error) throw error;
    return z
      .array(snapshotRowSchema)
      .parse(data)
      .map((row) => ({
        assessedAt: new Date(row.assessed_at).toISOString(),
        score: row.score,
        attempts: row.attempts,
      }));
  }
}
