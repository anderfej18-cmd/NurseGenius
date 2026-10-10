import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { userDirectorySchema } from "./user-directory.schemas";
import { validated } from "./validated";

// Client-safe module (AGENTS.md): server code is loaded with a dynamic import inside each handler.

/** Admins only: every student's username and tier, a page at a time, with the totals per tier. */
export const getUserDirectory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(userDirectorySchema))
  .handler(async ({ data, context }) => {
    const { userDirectoryController } =
      await import("@/server/user-directory/user-directory.controller.server");
    return userDirectoryController.get(context, data);
  });
