import { describe, expect, it, vi } from "vitest";
import { ValidationError } from "@/lib/app-errors";
import { MAX_OFFSET } from "../../types";
import { FRIEND_CONFIG } from "./friend.config";
import { type FriendshipEntry, FriendService } from "./friend.service";

const USER = "user-1";
const entry = (n: number): FriendshipEntry => ({
  friendshipId: `f${n}`,
  username: `student${n}`,
  since: new Date("2026-10-05T10:00:00.000Z"),
});

function setup(entries: FriendshipEntry[] = [entry(1), entry(2), entry(3)]) {
  const store = {
    requestFriend: vi.fn(
      async (
        _user: string,
        _username: string,
        _limits: { maxFriends: number; maxPending: number },
      ) => ({ friendshipId: "f1", status: "pending" }) as const,
    ),
    respond: vi.fn(async (_user: string, _id: string, accept: boolean, _maxFriends: number) =>
      accept ? ("accepted" as const) : ("declined" as const),
    ),
    remove: vi.fn(async (_user: string, _id: string) => undefined),
    list: vi.fn(async (_user: string, _kind: string, page: { limit: number; offset: number }) =>
      entries.slice(page.offset, page.offset + page.limit),
    ),
  };
  return { service: new FriendService({ store }), store };
}

describe("FriendService.request", () => {
  it("asks the named student with the configured limits, as the signed-in student", async () => {
    const { service, store } = setup();
    const result = await service.request(USER, { username: "  bob  " });

    expect(store.requestFriend).toHaveBeenCalledWith(USER, "bob", {
      maxFriends: FRIEND_CONFIG.maxFriends,
      maxPending: FRIEND_CONFIG.maxPendingRequests,
    });
    expect(result).toEqual({ friendshipId: "f1", status: "pending" });
  });

  it.each([[""], ["   "]])(
    "refuses the empty username %j before asking anyone",
    async (username) => {
      const { service, store } = setup();
      await expect(service.request(USER, { username })).rejects.toBeInstanceOf(ValidationError);
      expect(store.requestFriend).not.toHaveBeenCalled();
    },
  );

  it("refuses a username longer than any student can have", async () => {
    const { service, store } = setup();
    const tooLong = "x".repeat(FRIEND_CONFIG.maxUsernameLength + 1);
    await expect(service.request(USER, { username: tooLong })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(store.requestFriend).not.toHaveBeenCalled();
  });
});

describe("FriendService.respond", () => {
  it("accepts or declines as the signed-in student", async () => {
    const { service, store } = setup();
    expect(await service.respond(USER, { friendshipId: "f1", accept: true })).toEqual({
      outcome: "accepted",
    });
    expect(store.respond).toHaveBeenCalledWith(USER, "f1", true, FRIEND_CONFIG.maxFriends);
    expect(await service.respond(USER, { friendshipId: "f1", accept: false })).toEqual({
      outcome: "declined",
    });
  });
});

describe("FriendService.remove", () => {
  it("ends the friendship as the signed-in student", async () => {
    const { service, store } = setup();
    expect(await service.remove(USER, { friendshipId: "f1" })).toEqual({ removed: true });
    expect(store.remove).toHaveBeenCalledWith(USER, "f1");
  });
});

describe("FriendService.list", () => {
  it("asks for one row more than the page, to know whether there is a next page", async () => {
    const { service, store } = setup();
    const page = await service.list(USER, { kind: "friends", limit: 2 });

    expect(store.list).toHaveBeenCalledWith(USER, "friends", { limit: 3, offset: 0 });
    expect(page.items.map((item) => item.friendshipId)).toEqual(["f1", "f2"]);
    expect(page.nextOffset).toBe(2);
  });

  it("has no next page after the last row", async () => {
    const { service } = setup();
    const page = await service.list(USER, { kind: "incoming", limit: 2, offset: 2 });
    expect(page.items.map((item) => item.friendshipId)).toEqual(["f3"]);
    expect(page.nextOffset).toBeNull();
  });

  it("is an empty page for a student with no one", async () => {
    const { service } = setup([]);
    expect(await service.list(USER, { kind: "outgoing" })).toEqual({ items: [], nextOffset: null });
  });

  it("refuses a page beyond the limit on offsets", async () => {
    const { service, store } = setup();
    await expect(
      service.list(USER, { kind: "friends", offset: MAX_OFFSET + 1 }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(store.list).not.toHaveBeenCalled();
  });
});
