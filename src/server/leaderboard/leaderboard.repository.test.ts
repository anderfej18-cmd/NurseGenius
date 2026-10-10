import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "../testing/fake-supabase";
import { SupabaseLeaderboardStore } from "./leaderboard.repository.server";

const dailyRow = {
  user_id: "u1",
  username: "alice",
  avg_score: "81.5",
  attempted: 120,
  correct: 100,
};

describe("SupabaseLeaderboardStore", () => {
  it("reads the daily board through its function, with no arguments, and parses the numbers", async () => {
    const fake = createFakeSupabase([{ data: [dailyRow] }]);
    const rows = await new SupabaseLeaderboardStore(fake.client).daily();
    expect(fake.callsOn("rpc:get_daily_leaderboard", "args")[0].args[0]).toBeUndefined();
    expect(rows).toEqual([
      {
        userId: "u1",
        username: "alice",
        avgScore: 81.5,
        attempted: 120,
        correct: 100,
        activeDays: null,
      },
    ]);
  });

  it("reads the weekly board and keeps the active days", async () => {
    const fake = createFakeSupabase([{ data: [{ ...dailyRow, active_days: 5 }] }]);
    const rows = await new SupabaseLeaderboardStore(fake.client).weekly();
    expect(fake.recorded[0].target).toBe("rpc:get_weekly_leaderboard");
    expect(rows[0].activeDays).toBe(5);
  });

  it("fails loudly on a malformed row instead of showing a wrong board", async () => {
    const fake = createFakeSupabase([{ data: [{ ...dailyRow, attempted: "many" }] }]);
    await expect(new SupabaseLeaderboardStore(fake.client).daily()).rejects.toThrow();
  });

  it("surfaces a database error", async () => {
    const fake = createFakeSupabase([{ error: { message: "boom" } }]);
    await expect(new SupabaseLeaderboardStore(fake.client).daily()).rejects.toMatchObject({
      message: "boom",
    });
  });
});
