import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { guard } from "../errors";
import type { ExamType } from "../types";
import { createCompetition } from "./competition.container.server";
import type { FriendListKind } from "./friends/friend.service";

const competition = () => createCompetition(supabaseAdmin);

// The user id always comes from the verified JWT (requireSupabaseAuth), never from the request body.
export const competitionController = {
  requestFriend: (userId: string, input: { username: string }) =>
    guard(() => competition().friends.request(userId, input)),
  respondToFriendRequest: (userId: string, input: { friendshipId: string; accept: boolean }) =>
    guard(() => competition().friends.respond(userId, input)),
  removeFriend: (userId: string, input: { friendshipId: string }) =>
    guard(() => competition().friends.remove(userId, input)),
  listFriends: (userId: string, input: { kind: FriendListKind; limit?: number; offset?: number }) =>
    guard(() => competition().friends.list(userId, input)),
  createFriendChallenge: (userId: string, input: { friendshipId: string; examType?: ExamType }) =>
    guard(() => competition().challenges.create(userId, input)),
  declineFriendChallenge: (userId: string, input: { challengeId: string }) =>
    guard(() => competition().challenges.decline(userId, input)),
  startFriendChallenge: (userId: string, input: { challengeId: string }) =>
    guard(() => competition().challenges.start(userId, input)),
  getFriendChallenge: (userId: string, input: { challengeId: string }) =>
    guard(() => competition().challenges.get(userId, input)),
  listFriendChallenges: (userId: string, input: { limit?: number; offset?: number }) =>
    guard(() => competition().challenges.list(userId, input)),
};
