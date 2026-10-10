import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { emptySchema } from "./common.schemas";
import {
  dailyChallengeSchema,
  examDateSchema,
  studyPlanSchema,
  xpHistorySchema,
} from "./engagement.schemas";
import { validated } from "./validated";

// Client-safe module (AGENTS.md): server code is loaded with a dynamic import inside each handler.

/** The signed-in student's study streak, calculated on the server from their answers. */
export const getStudyStreak = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(emptySchema))
  .handler(async ({ context }) => {
    const { engagementController } =
      await import("@/server/engagement/engagement.controller.server");
    return engagementController.getStudyStreak(context.userId);
  });

/** XP, level and achievements (with progress toward the locked ones). Catches up on finished sessions first. */
export const getGamificationSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(emptySchema))
  .handler(async ({ context }) => {
    const { engagementController } =
      await import("@/server/engagement/engagement.controller.server");
    return engagementController.getGamificationSummary(context.userId);
  });

/** The signed-in student's XP ledger, newest first. Read-only: XP is only ever paid by the server. */
export const listXpHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(xpHistorySchema))
  .handler(async ({ data, context }) => {
    const { engagementController } =
      await import("@/server/engagement/engagement.controller.server");
    return engagementController.listXpHistory(context.userId, data);
  });

/** Today's daily challenge for the signed-in student; created on first use with questions the server chooses. */
export const getDailyChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(dailyChallengeSchema))
  .handler(async ({ data, context }) => {
    const { engagementController } =
      await import("@/server/engagement/engagement.controller.server");
    return engagementController.getDailyChallenge(context.userId, data.examType);
  });

/** Starts (or returns the running) session for today's daily challenge. The request cannot name questions. */
export const startDailyChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(dailyChallengeSchema))
  .handler(async ({ data, context }) => {
    const { engagementController } =
      await import("@/server/engagement/engagement.controller.server");
    return engagementController.startDailyChallenge(context.userId, data.examType);
  });

/** The signed-in student's study plan with how much of it is done, or null if they have none. */
export const getStudyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(emptySchema))
  .handler(async ({ context }) => {
    const { engagementController } =
      await import("@/server/engagement/engagement.controller.server");
    return engagementController.getStudyPlan(context.userId);
  });

/** Makes a new study plan from the profile's exam date and the question bank, replacing any earlier one. */
export const createStudyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(studyPlanSchema))
  .handler(async ({ data, context }) => {
    const { engagementController } =
      await import("@/server/engagement/engagement.controller.server");
    return engagementController.createStudyPlan(context.userId, data);
  });

/** Saves the signed-in student's exam date: it must be in the future and within two years. */
export const setExamDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(examDateSchema))
  .handler(async ({ data, context }) => {
    const { engagementController } =
      await import("@/server/engagement/engagement.controller.server");
    return engagementController.setExamDate(context.userId, data.examDate);
  });
