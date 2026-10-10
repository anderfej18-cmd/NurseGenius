import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { ForbiddenError } from "../errors";

/**
 * Admin gate for server functions. Uses the caller's own (RLS) client so the same `is_any_admin`
 * role check the database policies use decides; infrastructure errors are rethrown, not read as "no".
 */
export async function assertAdmin(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("is_any_admin", { _user_id: userId });
  if (error) throw error;
  if (!data) throw new ForbiddenError("You are not authorized to manage content.");
}
