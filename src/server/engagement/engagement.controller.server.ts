import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { guard } from "../errors";
import type { ExamType } from "../types";
import type { StudyPlanSettings } from "./plans/study-plan.service";
import { createEngagement } from "./engagement.container.server";

const engagement = () => createEngagement(supabaseAdmin);

// The user id always comes from the verified JWT (requireSupabaseAuth), never from the request body.
export const engagementController = {
  getStudyStreak: (userId: string) => guard(() => engagement().streaks.get(userId)),
  getGamificationSummary: (userId: string) =>
    guard(() => engagement().gamification.summary(userId)),
  listXpHistory: (userId: string, request: { limit?: number; offset?: number }) =>
    guard(() => engagement().gamification.history(userId, request)),
  getDailyChallenge: (userId: string, examType?: ExamType) =>
    guard(() => engagement().challenges.today(userId, { examType })),
  startDailyChallenge: (userId: string, examType?: ExamType) =>
    guard(() => engagement().challenges.start(userId, { examType })),
  getStudyPlan: (userId: string) => guard(() => engagement().plans.get(userId)),
  setExamDate: (userId: string, examDate: string) =>
    guard(() => engagement().plans.setExamDate(userId, examDate)),
  createStudyPlan: (
    userId: string,
    request: Partial<StudyPlanSettings> & { examType?: ExamType },
  ) => guard(() => engagement().plans.create(userId, request)),
};
