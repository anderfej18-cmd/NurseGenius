import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { assertAdmin } from "../access/admin-access.server";
import { guard } from "../errors";
import { SupabaseUserDirectoryStore } from "./user-directory.repository.server";
import { UserDirectoryService } from "./user-directory.service";

const service = () =>
  new UserDirectoryService({ store: new SupabaseUserDirectoryStore(supabaseAdmin) });

export const userDirectoryController = {
  get: (
    caller: { userId: string; supabase: SupabaseClient<Database> },
    input: { limit?: number; offset?: number },
  ) =>
    guard(async () => {
      await assertAdmin(caller.supabase, caller.userId);
      return service().get(input);
    }),
};
