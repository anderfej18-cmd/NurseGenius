import { describe, expect, it } from "vitest";
import { ConflictError, LimitReachedError, NotFoundError } from "@/lib/app-errors";
import { createFakeSupabase } from "../../testing/fake-supabase";
import { SupabaseFriendStore } from "./friend.repository.server";

const USER = "user-1";
const argsOf = (fake: ReturnType<typeof createFakeSupabase>, fn: string) =>
  fake.callsOn(`rpc:${fn}`, "args")[0].args[0];

describe("SupabaseFriendStore.requestFriend", () => {
  it("names the signed-in student, the username and the limits, and maps the answer", async () => {
    const fake = createFakeSupabase([{ data: [{ friendship_id: "f1", status: "pending" }] }]);
    const result = await new SupabaseFriendStore(fake.client).requestFriend(USER, "bob", {
      maxFriends: 200,
      maxPending: 20,
    });
    expect(argsOf(fake, "request_friend")).toEqual({
      _user_id: USER,
      _username: "bob",
      _max_friends: 200,
      _max_pending: 20,
    });
    expect(result).toEqual({ friendshipId: "f1", status: "pending" });
  });

  it.each([
    ["user_not_found", NotFoundError],
    ["already_friends", ConflictError],
    ["request_limit", LimitReachedError],
  ])("turns the database's %s into a typed error", async (message, expected) => {
    const fake = createFakeSupabase([{ error: { message: `ERROR: ${message}` } }]);
    await expect(
      new SupabaseFriendStore(fake.client).requestFriend(USER, "bob", {
        maxFriends: 1,
        maxPending: 1,
      }),
    ).rejects.toBeInstanceOf(expected);
  });

  it("rejects an answer that is not a friendship", async () => {
    const fake = createFakeSupabase([{ data: [{ friendship_id: "f1", status: "blocked" }] }]);
    await expect(
      new SupabaseFriendStore(fake.client).requestFriend(USER, "bob", {
        maxFriends: 1,
        maxPending: 1,
      }),
    ).rejects.toThrow();
  });
});

describe("SupabaseFriendStore.respond", () => {
  it("names the signed-in student and the request", async () => {
    const fake = createFakeSupabase([{ data: "accepted" }]);
    const outcome = await new SupabaseFriendStore(fake.client).respond(USER, "f1", true, 200);
    expect(argsOf(fake, "respond_friend_request")).toEqual({
      _user_id: USER,
      _friendship_id: "f1",
      _accept: true,
      _max_friends: 200,
    });
    expect(outcome).toBe("accepted");
  });

  it("turns a request that is not theirs to answer into not found", async () => {
    const fake = createFakeSupabase([{ error: { message: "ERROR: friendship_not_found" } }]);
    await expect(
      new SupabaseFriendStore(fake.client).respond(USER, "f1", false, 200),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("SupabaseFriendStore.remove", () => {
  it("names the signed-in student and the friendship", async () => {
    const fake = createFakeSupabase([{ data: null }]);
    await new SupabaseFriendStore(fake.client).remove(USER, "f1");
    expect(argsOf(fake, "remove_friendship")).toEqual({ _user_id: USER, _friendship_id: "f1" });
  });

  it("turns someone else's friendship into not found", async () => {
    const fake = createFakeSupabase([{ error: { message: "ERROR: friendship_not_found" } }]);
    await expect(new SupabaseFriendStore(fake.client).remove(USER, "f1")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("SupabaseFriendStore.list", () => {
  it("asks for one kind of list for this student, one page, and maps the rows", async () => {
    const fake = createFakeSupabase([
      {
        data: [
          { friendship_id: "f1", username: "bob", since: "2026-10-05T10:00:00.000Z" },
          { friendship_id: "f2", username: "carol", since: "2026-10-04T10:00:00.000Z" },
        ],
      },
    ]);
    const rows = await new SupabaseFriendStore(fake.client).list(USER, "incoming", {
      limit: 21,
      offset: 40,
    });
    expect(argsOf(fake, "list_friendships")).toEqual({
      _user_id: USER,
      _kind: "incoming",
      _limit: 21,
      _offset: 40,
    });
    expect(rows).toEqual([
      { friendshipId: "f1", username: "bob", since: new Date("2026-10-05T10:00:00.000Z") },
      { friendshipId: "f2", username: "carol", since: new Date("2026-10-04T10:00:00.000Z") },
    ]);
  });

  it("passes an unexpected database error on to be logged, not shown", async () => {
    const fake = createFakeSupabase([{ error: { message: "boom" } }]);
    await expect(
      new SupabaseFriendStore(fake.client).list(USER, "friends", { limit: 1, offset: 0 }),
    ).rejects.toEqual({ message: "boom" });
  });
});
