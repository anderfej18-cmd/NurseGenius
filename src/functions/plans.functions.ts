import { createServerFn } from "@tanstack/react-start";
import { emptySchema } from "./common.schemas";
import { validated } from "./validated";

// Client-safe module (AGENTS.md): server code is loaded with a dynamic import inside the handler.

/**
 * Public by design, like the database's own "anyone reads active plans" policy: the landing page shows
 * what each plan costs and how long it lasts to visitors who have no account. Returns only the name,
 * price in naira and length in days of active plans; no token is needed because nothing private is read.
 */
export const listPublicPlans = createServerFn({ method: "POST" })
  .validator(validated(emptySchema))
  .handler(async () => {
    const { plansController } = await import("@/server/plans/plans.controller.server");
    return plansController.listPublic();
  });
