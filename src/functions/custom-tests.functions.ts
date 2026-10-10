import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { emptySchema } from "./common.schemas";
import {
  claimAttemptSchema,
  createCustomTestSchema,
  getSharedTestSchema,
  importCustomTestQuestionsSchema,
  republishCustomTestSchema,
  startSharedTestSchema,
  submitSharedTestSchema,
} from "./custom-tests.schemas";
import { validated } from "./validated";

// Client-safe module (AGENTS.md): server code is loaded with a dynamic import inside each handler.
// The shared-test functions (get, start, submit) are public by design: the link token and the
// attempt key are the credentials, and each call is rate limited per caller address (ADR-0007).

const controller = async () =>
  (await import("@/server/custom-tests/custom-tests.controller.server")).customTestController;
const address = async () => (await import("@/server/http/client-address.server")).clientAddress();

export const createCustomTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(createCustomTestSchema))
  .handler(async ({ data, context }) => (await controller()).create(context, data));

export const listCustomTests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(emptySchema))
  .handler(async ({ context }) => (await controller()).list(context));

export const republishCustomTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(republishCustomTestSchema))
  .handler(async ({ data, context }) => (await controller()).republish(context, data));

export const importCustomTestQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(importCustomTestQuestionsSchema))
  .handler(async ({ data, context }) => (await controller()).importToBank(context, data));

export const getSharedTest = createServerFn({ method: "POST" })
  .validator(validated(getSharedTestSchema))
  .handler(async ({ data }) => (await controller()).getShared(data, await address()));

export const startSharedTest = createServerFn({ method: "POST" })
  .validator(validated(startSharedTestSchema))
  .handler(async ({ data }) => (await controller()).startShared(data, await address()));

export const submitSharedTest = createServerFn({ method: "POST" })
  .validator(validated(submitSharedTestSchema))
  .handler(async ({ data }) => (await controller()).submitShared(data, await address()));

export const claimSharedTestAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(claimAttemptSchema))
  .handler(async ({ data, context }) =>
    (await controller()).claim({ userId: context.userId, email: context.claims.email }, data),
  );
