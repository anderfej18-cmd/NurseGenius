import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  challengeIdSchema,
  createFriendChallengeSchema,
  friendRequestSchema,
  friendshipIdSchema,
  listChallengesSchema,
  listFriendsSchema,
  respondFriendRequestSchema,
} from "./competition.schemas";
import { validated } from "./validated";

// Client-safe module (AGENTS.md): server code is loaded with a dynamic import inside each handler.

/** Asks the student with this username to be a friend (or accepts their request to you). */
export const requestFriend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(friendRequestSchema))
  .handler(async ({ data, context }) => {
    const { competitionController } =
      await import("@/server/competition/competition.controller.server");
    return competitionController.requestFriend(context.userId, data);
  });

/** Accepts or declines a friend request that was made to the signed-in student. */
export const respondToFriendRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(respondFriendRequestSchema))
  .handler(async ({ data, context }) => {
    const { competitionController } =
      await import("@/server/competition/competition.controller.server");
    return competitionController.respondToFriendRequest(context.userId, data);
  });

/** Ends a friendship, or withdraws a request the signed-in student made. */
export const removeFriend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(friendshipIdSchema))
  .handler(async ({ data, context }) => {
    const { competitionController } =
      await import("@/server/competition/competition.controller.server");
    return competitionController.removeFriend(context.userId, data);
  });

/** The signed-in student's friends, or the requests waiting for them or from them. Usernames only. */
export const listFriends = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(listFriendsSchema))
  .handler(async ({ data, context }) => {
    const { competitionController } =
      await import("@/server/competition/competition.controller.server");
    return competitionController.listFriends(context.userId, data);
  });

/** Challenges a friend to a set of questions the server chooses; the friend is named by the friendship, never by id. */
export const createFriendChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(createFriendChallengeSchema))
  .handler(async ({ data, context }) => {
    const { competitionController } =
      await import("@/server/competition/competition.controller.server");
    return competitionController.createFriendChallenge(context.userId, data);
  });

/** Declines a challenge made to the signed-in student, before starting it. */
export const declineFriendChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(challengeIdSchema))
  .handler(async ({ data, context }) => {
    const { competitionController } =
      await import("@/server/competition/competition.controller.server");
    return competitionController.declineFriendChallenge(context.userId, data);
  });

/** Starts (or returns the running) session for the signed-in student's side of a challenge. */
export const startFriendChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(challengeIdSchema))
  .handler(async ({ data, context }) => {
    const { competitionController } =
      await import("@/server/competition/competition.controller.server");
    return competitionController.startFriendChallenge(context.userId, data);
  });

/** One challenge: its state and, once the student has finished, the result. */
export const getFriendChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(challengeIdSchema))
  .handler(async ({ data, context }) => {
    const { competitionController } =
      await import("@/server/competition/competition.controller.server");
    return competitionController.getFriendChallenge(context.userId, data);
  });

/** The signed-in student's challenges, newest first. */
export const listFriendChallenges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(listChallengesSchema))
  .handler(async ({ data, context }) => {
    const { competitionController } =
      await import("@/server/competition/competition.controller.server");
    return competitionController.listFriendChallenges(context.userId, data);
  });
