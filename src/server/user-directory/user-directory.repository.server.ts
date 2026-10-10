import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import type { DirectoryUser, UserTier } from "./user-directory.service";

const tierSchema = z.enum(["novice", "erudite", "scholar"]);
// Parsing field by field drops any column the database function might one day add (an email, say).
const userSchema = z.object({ username: z.string().nullable(), tier: tierSchema });
const countSchema = z.object({ tier: tierSchema, total: z.number().int() });

/** Reads the directory with the service role; the controller has already checked the caller is an admin. */
export class SupabaseUserDirectoryStore {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async list(page: { limit: number; offset: number }): Promise<DirectoryUser[]> {
    const { data, error } = await this.db.rpc("list_user_directory", {
      _limit: page.limit,
      _offset: page.offset,
    });
    if (error) throw error;
    return z.array(userSchema).parse(data);
  }

  async countByTier(): Promise<Array<{ tier: UserTier; total: number }>> {
    const { data, error } = await this.db.rpc("count_users_by_tier");
    if (error) throw error;
    return z.array(countSchema).parse(data);
  }
}
