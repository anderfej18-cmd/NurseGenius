import { describe, expect, it } from "vitest";
import { FRIEND_CONFIG } from "../server/competition/friends/friend.config";
import {
  challengeIdSchema,
  createFriendChallengeSchema,
  friendRequestSchema,
  friendshipIdSchema,
  listChallengesSchema,
  listFriendsSchema,
  respondFriendRequestSchema,
} from "./competition.schemas";

const ID = "6f1c2f6e-0a53-4a54-9d3b-6a6f2b7a0c11";

describe("friendRequestSchema", () => {
  it("accepts a username, up to the longest allowed", () => {
    expect(friendRequestSchema.safeParse({ username: "bob" }).success).toBe(true);
    expect(
      friendRequestSchema.safeParse({ username: "x".repeat(FRIEND_CONFIG.maxUsernameLength) })
        .success,
    ).toBe(true);
  });

  it.each([
    [{}],
    [{ username: "" }],
    [{ username: "   " }],
    [{ username: "x".repeat(FRIEND_CONFIG.maxUsernameLength + 1) }],
    [{ username: 5 }],
    [{ username: "bob", userId: "someone-else" }],
    [{ username: "bob", status: "accepted" }],
  ])("rejects %j", (payload) => {
    expect(friendRequestSchema.safeParse(payload).success).toBe(false);
  });
});

describe("respondFriendRequestSchema", () => {
  it("accepts a request id and a decision", () => {
    expect(respondFriendRequestSchema.safeParse({ friendshipId: ID, accept: true }).success).toBe(
      true,
    );
    expect(respondFriendRequestSchema.safeParse({ friendshipId: ID, accept: false }).success).toBe(
      true,
    );
  });

  it.each([
    [{ friendshipId: ID }],
    [{ accept: true }],
    [{ friendshipId: "not-a-uuid", accept: true }],
    [{ friendshipId: ID, accept: "yes" }],
    [{ friendshipId: ID, accept: true, userId: "someone-else" }],
    [{ friendshipId: ID, accept: true, status: "accepted" }],
  ])("rejects %j", (payload) => {
    expect(respondFriendRequestSchema.safeParse(payload).success).toBe(false);
  });
});

describe("friendshipIdSchema", () => {
  it("accepts a friendship id only", () => {
    expect(friendshipIdSchema.safeParse({ friendshipId: ID }).success).toBe(true);
    expect(friendshipIdSchema.safeParse({}).success).toBe(false);
    expect(friendshipIdSchema.safeParse({ friendshipId: "1" }).success).toBe(false);
    expect(friendshipIdSchema.safeParse({ friendshipId: ID, userId: "x" }).success).toBe(false);
  });
});

describe("listFriendsSchema", () => {
  it.each(["friends", "incoming", "outgoing"])(
    "accepts the %s list, with or without a page",
    (kind) => {
      expect(listFriendsSchema.safeParse({ kind }).success).toBe(true);
      expect(listFriendsSchema.safeParse({ kind, limit: 50, offset: 10_000 }).success).toBe(true);
    },
  );

  it.each([
    [{}],
    [{ kind: "everyone" }],
    [{ kind: "friends", limit: 0 }],
    [{ kind: "friends", limit: 51 }],
    [{ kind: "friends", offset: -1 }],
    [{ kind: "friends", offset: 10_001 }],
    [{ kind: "friends", userId: "someone-else" }],
  ])("rejects %j", (payload) => {
    expect(listFriendsSchema.safeParse(payload).success).toBe(false);
  });
});

describe("createFriendChallengeSchema", () => {
  it("accepts a friendship, with or without an exam type", () => {
    expect(createFriendChallengeSchema.safeParse({ friendshipId: ID }).success).toBe(true);
    expect(
      createFriendChallengeSchema.safeParse({ friendshipId: ID, examType: "RM" }).success,
    ).toBe(true);
  });

  it.each([
    [{}],
    [{ friendshipId: "not-a-uuid" }],
    [{ friendshipId: ID, examType: "Both" }],
    [{ friendshipId: ID, questionIds: ["q1"] }],
    [{ friendshipId: ID, opponentId: ID }],
    [{ friendshipId: ID, userId: "someone-else" }],
    [{ friendshipId: ID, expiresAt: "2030-01-01T00:00:00Z" }],
  ])("rejects %j", (payload) => {
    expect(createFriendChallengeSchema.safeParse(payload).success).toBe(false);
  });
});

describe("challengeIdSchema", () => {
  it("accepts a challenge id only", () => {
    expect(challengeIdSchema.safeParse({ challengeId: ID }).success).toBe(true);
    expect(challengeIdSchema.safeParse({}).success).toBe(false);
    expect(challengeIdSchema.safeParse({ challengeId: "1" }).success).toBe(false);
    expect(challengeIdSchema.safeParse({ challengeId: ID, winner: "me" }).success).toBe(false);
  });
});

describe("listChallengesSchema", () => {
  it("accepts no input, or a page", () => {
    expect(listChallengesSchema.safeParse({}).success).toBe(true);
    expect(listChallengesSchema.safeParse({ limit: 50, offset: 10_000 }).success).toBe(true);
  });

  it.each([
    [{ limit: 0 }],
    [{ limit: 51 }],
    [{ offset: -1 }],
    [{ offset: 10_001 }],
    [{ userId: "x" }],
  ])("rejects %j", (payload) => {
    expect(listChallengesSchema.safeParse(payload).success).toBe(false);
  });
});
