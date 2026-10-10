import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { guard } from "../errors";
import type { ExamType } from "../types";
import { createIntelligence } from "./intelligence.container.server";
import type { PeriodRequest } from "./analytics.service";
import type { DueReviewRequest } from "./review/review.types";

const intelligence = () => createIntelligence(supabaseAdmin);

// The user id always comes from the verified JWT (requireSupabaseAuth), never from the request body.
export const intelligenceController = {
  listDueReviews: (userId: string, request: DueReviewRequest) =>
    guard(() => intelligence().reviews.listDue(userId, request)),
  getSimilarQuestions: (userId: string, questionId: string, limit?: number) =>
    guard(() => intelligence().similar.find(userId, questionId, limit)),
  getTopicMastery: (userId: string) => guard(() => intelligence().analytics.mastery(userId)),
  getConfidenceAnalytics: (userId: string, request: PeriodRequest) =>
    guard(() => intelligence().analytics.confidence(userId, request)),
  getTimeAnalytics: (userId: string, request: PeriodRequest) =>
    guard(() => intelligence().analytics.time(userId, request)),
  getDailyRecommendation: (userId: string, availableMinutes?: number) =>
    guard(() => intelligence().recommendation.today(userId, { availableMinutes })),
  getExamReadiness: (userId: string, examType?: ExamType) =>
    guard(() => intelligence().readiness.assess(userId, { examType })),
  getPerformanceAnalysis: (userId: string) =>
    guard(() => intelligence().performance.analyze(userId)),
};
