import { describe, expect, it, vi } from "vitest";
import { ValidationError } from "../errors";
import { MAX_OFFSET } from "../types";
import { UserDirectoryService } from "./user-directory.service";

function setup(users = 3) {
  const store = {
    list: vi.fn(async (page: { limit: number; offset: number }) =>
      Array.from({ length: Math.min(page.limit, users - page.offset) }, (_, i) => ({
        username: `user${page.offset + i}`,
        tier: "novice" as const,
      })),
    ),
    countByTier: vi.fn(async () => [
      { tier: "novice" as const, total: 5 },
      { tier: "scholar" as const, total: 2 },
    ]),
  };
  return { service: new UserDirectoryService({ store }), store };
}

describe("UserDirectoryService.get", () => {
  it("returns a page of usernames with their tier, and the totals per tier (missing tiers are zero)", async () => {
    const { service } = setup();
    const result = await service.get({});
    expect(result.users).toEqual([
      { username: "user0", tier: "novice" },
      { username: "user1", tier: "novice" },
      { username: "user2", tier: "novice" },
    ]);
    expect(result.totals).toEqual({ novice: 5, erudite: 0, scholar: 2, all: 7 });
    expect(result.nextOffset).toBeNull();
  });

  it("asks for one row more than the page to know whether another page exists", async () => {
    const { service, store } = setup(10);
    const result = await service.get({ limit: 4 });
    expect(store.list).toHaveBeenCalledWith({ limit: 5, offset: 0 });
    expect(result.users).toHaveLength(4);
    expect(result.nextOffset).toBe(4);
  });

  it("refuses an offset beyond the allowed range, before reading anything", async () => {
    const { service, store } = setup();
    await expect(service.get({ offset: MAX_OFFSET + 1 })).rejects.toBeInstanceOf(ValidationError);
    expect(store.list).not.toHaveBeenCalled();
  });

  it("exposes nothing but a username and a tier", async () => {
    const { service } = setup(1);
    expect(Object.keys((await service.get({})).users[0]).sort()).toEqual(["tier", "username"]);
  });
});
