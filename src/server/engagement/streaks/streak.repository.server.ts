import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import type { StudyDay } from "./streak";

const studyDayRowSchema = z.object({
  study_day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  answered: z.number().int().min(0),
});

/** Reads the days a student studied. Service-role client: the function takes the user id explicitly. */
export class SupabaseStudyDaysStore {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async listStudyDays(userId: string, since: string): Promise<StudyDay[]> {
    const { data, error } = await this.db.rpc("get_study_days", {
      _user_id: userId,
      _since: since,
    });
    if (error) throw error;
    return z
      .array(studyDayRowSchema)
      .parse(data)
      .map((row) => ({ day: row.study_day, answered: row.answered }));
  }
}
