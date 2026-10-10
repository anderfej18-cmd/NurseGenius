import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { bestEffort, guard } from "../errors";
import { createEngagement } from "../engagement/engagement.container.server";
import { createIntelligence } from "../intelligence/intelligence.container.server";
import { secureRandom } from "./sampling";
import { SupabaseSessionRepository } from "./session.repository.server";
import { SessionService } from "./session.service";
import type { SaveAnswerInput, StartSessionInput } from "./session.types";

// The user id always comes from the verified JWT (requireSupabaseAuth), never from the request body.
const service = () => {
  const { reviews, adaptiveSelection, similar } = createIntelligence(supabaseAdmin);
  const { gamification } = createEngagement(supabaseAdmin);
  return new SessionService({
    repository: new SupabaseSessionRepository(supabaseAdmin),
    clock: () => new Date(),
    random: secureRandom,
    // The exam is already scored when this runs, so a failure here is logged, not surfaced.
    afterScoring: async (userId) => {
      await bestEffort(() => reviews.refreshStale(userId), "refresh review schedule");
      await bestEffort(() => gamification.sync(userId), "update XP and achievements");
    },
    adaptiveSelection,
    similar,
  });
};

export const sessionController = {
  start: (userId: string, input: StartSessionInput) => guard(() => service().start(userId, input)),
  get: (userId: string, examId: string) => guard(() => service().get(userId, examId)),
  saveAnswer: (userId: string, input: SaveAnswerInput) =>
    guard(() => service().saveAnswer(userId, input)),
  submit: (userId: string, examId: string) => guard(() => service().submit(userId, examId)),
  history: (userId: string, limit: number) => guard(() => service().history(userId, limit)),
  results: (userId: string, examId: string) => guard(() => service().results(userId, examId)),
};
