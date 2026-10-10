import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  dailyRecommendationSchema,
  examReadinessSchema,
  listDueReviewsSchema,
  periodSchema,
  similarQuestionsSchema,
} from "./intelligence.schemas";
import { emptySchema } from "./common.schemas";
import { validated } from "./validated";

// Client-safe module (AGENTS.md): server code is loaded with a dynamic import inside each handler.

/** The signed-in student's questions that are due for review, most overdue first. */
export const listDueReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(listDueReviewsSchema))
  .handler(async ({ data, context }) => {
    const { intelligenceController } =
      await import("@/server/intelligence/intelligence.controller.server");
    return intelligenceController.listDueReviews(context.userId, data);
  });

/** Questions related to one the signed-in student has attempted (no answer keys). */
export const getSimilarQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(similarQuestionsSchema))
  .handler(async ({ data, context }) => {
    const { intelligenceController } =
      await import("@/server/intelligence/intelligence.controller.server");
    return intelligenceController.getSimilarQuestions(context.userId, data.questionId, data.limit);
  });

/** Mastery per topic for the signed-in student, weakest first. */
export const getTopicMastery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(emptySchema))
  .handler(async ({ context }) => {
    const { intelligenceController } =
      await import("@/server/intelligence/intelligence.controller.server");
    return intelligenceController.getTopicMastery(context.userId);
  });

/** Correct/wrong by low/medium/high confidence, with false- and weak-confidence flags. */
export const getConfidenceAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(periodSchema))
  .handler(async ({ data, context }) => {
    const { intelligenceController } =
      await import("@/server/intelligence/intelligence.controller.server");
    return intelligenceController.getConfidenceAnalytics(context.userId, data);
  });

/** Time spent per answer: averages, by topic, correct vs incorrect, trend and patterns. */
export const getTimeAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(periodSchema))
  .handler(async ({ data, context }) => {
    const { intelligenceController } =
      await import("@/server/intelligence/intelligence.controller.server");
    return intelligenceController.getTimeAnalytics(context.userId, data);
  });

/** Today's study plan for the signed-in student (deterministic, no AI). */
export const getDailyRecommendation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(dailyRecommendationSchema))
  .handler(async ({ data, context }) => {
    const { intelligenceController } =
      await import("@/server/intelligence/intelligence.controller.server");
    return intelligenceController.getDailyRecommendation(context.userId, data.availableMinutes);
  });

/** How prepared the signed-in student is for one exam: an internal metric, not a prediction. */
export const getExamReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(examReadinessSchema))
  .handler(async ({ data, context }) => {
    const { intelligenceController } =
      await import("@/server/intelligence/intelligence.controller.server");
    return intelligenceController.getExamReadiness(context.userId, data.examType);
  });

/** What the signed-in student's own recorded answers say: strong and weak topics, trends, repeated mistakes. */
export const getPerformanceAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(emptySchema))
  .handler(async ({ context }) => {
    const { intelligenceController } =
      await import("@/server/intelligence/intelligence.controller.server");
    return intelligenceController.getPerformanceAnalysis(context.userId);
  });
