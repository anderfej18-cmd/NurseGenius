import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { leaderboardSchema } from "./leaderboard.schemas";
import { validated } from "./validated";

// Client-safe module (AGENTS.md): server code is loaded with a dynamic import inside each handler.

/** The daily or weekly board for any signed-in student: ranks, display names and the caller's own row. */
export const getLeaderboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(leaderboardSchema))
  .handler(async ({ data, context }) => {
    const { leaderboardController } =
      await import("@/server/leaderboard/leaderboard.controller.server");
    return leaderboardController.get(context.userId, data);
  });
