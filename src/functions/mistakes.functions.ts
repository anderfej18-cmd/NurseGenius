import { createServerFn } from "@tanstack/react-start";
import { validated } from "./validated";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { listMistakesSchema } from "./mistakes.schemas";

// Client-safe module (AGENTS.md): server code is loaded with a dynamic import inside the handler.

/** The signed-in student's mistake bank (own data only; the id comes from the verified token). */
export const listMistakes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(listMistakesSchema))
  .handler(async ({ data, context }) => {
    const { mistakeController } = await import("@/server/mistakes/mistake.controller.server");
    return mistakeController.list(context.userId, data);
  });
