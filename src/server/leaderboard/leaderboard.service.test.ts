import { describe, expect, it, vi } from "vitest";
import { type LeaderboardRow, LeaderboardService } from "./leaderboard.service";

const row = (
  userId: string,
  username: string | null,
  overrides: Partial<LeaderboardRow> = {},
): LeaderboardRow => ({
  userId,
  username,
  avgScore: 80,
  attempted: 120,
  correct: 100,
  activeDays: null,
  ...overrides,
});

function setup(daily: LeaderboardRow[] = [], weekly: LeaderboardRow[] = []) {
  const store = { daily: vi.fn(async () => daily), weekly: vi.fn(async () => weekly) };
  return { service: new LeaderboardService({ store }), store };
}

describe("LeaderboardService.get", () => {
  it("ranks the rows in the order the database gave them and marks the caller's own row", async () => {
    const { service } = setup([row("u1", "alice"), row("u2", "bob"), row("u3", "carol")]);
    const board = await service.get("u2", { period: "daily" });
    expect(board.period).toBe("daily");
    expect(board.entries.map((e) => [e.rank, e.username, e.isYou])).toEqual([
      [1, "alice", false],
      [2, "bob", true],
      [3, "carol", false],
    ]);
  });

  it("never passes another student's id to the browser", async () => {
    const { service } = setup([row("secret-user-id", "alice")]);
    const board = await service.get("someone-else", { period: "daily" });
    expect(JSON.stringify(board)).not.toContain("secret-user-id");
    expect(Object.keys(board.entries[0]).sort()).toEqual([
      "activeDays",
      "attempted",
      "avgScore",
      "correct",
      "isYou",
      "rank",
      "username",
    ]);
  });

  it("calls a student with no username Anonymous", async () => {
    const { service } = setup([row("u1", null)]);
    expect((await service.get("u9", { period: "daily" })).entries[0].username).toBe("Anonymous");
  });

  it("reads only the board that was asked for, and carries the weekly active days", async () => {
    const { service, store } = setup([], [row("u1", "alice", { activeDays: 5 })]);
    const board = await service.get("u1", { period: "weekly" });
    expect(store.weekly).toHaveBeenCalledTimes(1);
    expect(store.daily).not.toHaveBeenCalled();
    expect(board.entries[0].activeDays).toBe(5);
  });

  it("returns an empty board, not an error, when nobody qualifies", async () => {
    const { service } = setup();
    expect(await service.get("u1", { period: "daily" })).toEqual({ period: "daily", entries: [] });
  });
});
