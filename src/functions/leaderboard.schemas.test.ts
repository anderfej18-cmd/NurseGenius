import { describe, expect, it } from "vitest";
import { leaderboardSchema } from "./leaderboard.schemas";
import { userDirectorySchema } from "./user-directory.schemas";

describe("leaderboardSchema", () => {
  it.each([["daily"], ["weekly"]])("accepts the %s board", (period) => {
    expect(leaderboardSchema.safeParse({ period }).success).toBe(true);
  });

  it.each([
    [{}],
    [{ period: "monthly" }],
    [{ period: "daily", userId: "someone-else" }],
    [{ period: "daily", limit: 10_000 }],
    [{ period: ["daily"] }],
  ])("rejects %j", (payload) => {
    expect(leaderboardSchema.safeParse(payload).success).toBe(false);
  });
});

describe("userDirectorySchema", () => {
  it.each([[{}], [{ limit: 50, offset: 10_000 }], [{ limit: 1 }]])("accepts %j", (payload) => {
    expect(userDirectorySchema.safeParse(payload).success).toBe(true);
  });

  it.each([
    [{ limit: 0 }],
    [{ limit: 51 }],
    [{ offset: -1 }],
    [{ offset: 10_001 }],
    [{ tier: "scholar" }],
    [{ email: "a@b.co" }],
  ])("rejects %j", (payload) => {
    expect(userDirectorySchema.safeParse(payload).success).toBe(false);
  });
});
