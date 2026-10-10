import { z } from "zod";
import { examTypeSchema } from "@/lib/exam-type";

/** The longest username a request can name; mirrors `FRIEND_CONFIG` (a test keeps them equal). */
export const friendRequestSchema = z
  .object({ username: z.string().trim().min(1).max(50) })
  .strict();

export const friendshipIdSchema = z.object({ friendshipId: z.string().uuid() }).strict();

export const respondFriendRequestSchema = z
  .object({ friendshipId: z.string().uuid(), accept: z.boolean() })
  .strict();

export const listFriendsSchema = z
  .object({
    kind: z.enum(["friends", "incoming", "outgoing"]),
    limit: z.number().int().min(1).max(50).optional(),
    offset: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();

/** The server chooses the questions, the opponent (from the friendship) and the closing date. */
export const createFriendChallengeSchema = z
  .object({ friendshipId: z.string().uuid(), examType: examTypeSchema.optional() })
  .strict();

export const challengeIdSchema = z.object({ challengeId: z.string().uuid() }).strict();

export const listChallengesSchema = z
  .object({
    limit: z.number().int().min(1).max(50).optional(),
    offset: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();
