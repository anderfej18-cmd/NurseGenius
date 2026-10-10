import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serviceCall } from "./fixtures";
import { createTestDb, type TestDb } from "./pglite-db";

let db: TestDb;
let alice: string;
let bob: string;
let carol: string;
let dave: string;

const MAX_FRIENDS = 5;
const MAX_PENDING = 3;

const request = (
  userId: string,
  username: string,
  maxFriends = MAX_FRIENDS,
  maxPending = MAX_PENDING,
) =>
  serviceCall<{ friendship_id: string; status: string }>(
    db,
    `SELECT * FROM public.request_friend($1, $2, $3, $4)`,
    [userId, username, maxFriends, maxPending],
  ).then((rows) => rows[0]);
const respond = (userId: string, friendshipId: string, accept: boolean, maxFriends = MAX_FRIENDS) =>
  serviceCall<{ outcome: string }>(
    db,
    `SELECT public.respond_friend_request($1, $2, $3, $4) AS outcome`,
    [userId, friendshipId, accept, maxFriends],
  ).then((rows) => rows[0].outcome);
const remove = (userId: string, friendshipId: string) =>
  serviceCall(db, `SELECT public.remove_friendship($1, $2)`, [userId, friendshipId]);
const list = (userId: string, kind: "friends" | "incoming" | "outgoing", limit = 50, offset = 0) =>
  serviceCall<{ friendship_id: string; username: string; since: string }>(
    db,
    `SELECT * FROM public.list_friendships($1, $2, $3, $4)`,
    [userId, kind, limit, offset],
  );
const clear = () => db.admin(`DELETE FROM public.friendships`);

beforeAll(async () => {
  db = await createTestDb();
  [alice, bob, carol, dave] = await Promise.all(
    ["alice", "bob", "carol", "dave"].map((name) => db.createUser(`${name}-fr@example.com`)),
  );
  for (const [id, name] of [
    [alice, "alice"],
    [bob, "bob"],
    [carol, "carol"],
    [dave, "dave"],
  ]) {
    await db.admin(`UPDATE public.profiles SET username = $2 WHERE id = $1`, [id, name]);
  }
});
afterAll(() => db.pg.close());

describe("request_friend", () => {
  it("creates a pending request that only the two students see", async () => {
    await clear();
    const created = await request(alice, "bob");
    expect(created.status).toBe("pending");

    expect((await list(alice, "outgoing")).map((r) => r.username)).toEqual(["bob"]);
    expect((await list(bob, "incoming")).map((r) => r.username)).toEqual(["alice"]);
    expect(await list(alice, "incoming")).toEqual([]);
    expect(await list(bob, "outgoing")).toEqual([]);
    expect(await list(alice, "friends")).toEqual([]);
    expect(await list(carol, "incoming")).toEqual([]);
    expect(await list(carol, "outgoing")).toEqual([]);
  });

  it("names no student that does not exist, and refuses a request to yourself", async () => {
    await clear();
    await expect(request(alice, "nobody")).rejects.toThrow(/user_not_found/);
    await expect(request(alice, "alice")).rejects.toThrow(/cannot_befriend_self/);
  });

  it("refuses a second request to the same student", async () => {
    await clear();
    await request(alice, "bob");
    await expect(request(alice, "bob")).rejects.toThrow(/request_pending/);
  });

  it("accepts the other student's request when both ask each other", async () => {
    await clear();
    await request(alice, "bob");
    const crossed = await request(bob, "alice");
    expect(crossed.status).toBe("accepted");
    expect((await list(alice, "friends")).map((r) => r.username)).toEqual(["bob"]);
    expect((await list(bob, "friends")).map((r) => r.username)).toEqual(["alice"]);
    await expect(request(alice, "bob")).rejects.toThrow(/already_friends/);
    await expect(request(bob, "alice")).rejects.toThrow(/already_friends/);
  });

  it("limits the requests a student can have waiting", async () => {
    await clear();
    await request(alice, "bob", MAX_FRIENDS, 2);
    await request(alice, "carol", MAX_FRIENDS, 2);
    await expect(request(alice, "dave", MAX_FRIENDS, 2)).rejects.toThrow(/request_limit/);
  });

  it("limits how many friends a student can have", async () => {
    await clear();
    const first = await request(alice, "bob");
    await respond(bob, first.friendship_id, true);
    await expect(request(alice, "carol", 1, MAX_PENDING)).rejects.toThrow(/friend_limit/);
  });
});

describe("respond_friend_request", () => {
  it("lets only the student who was asked accept", async () => {
    await clear();
    const { friendship_id } = await request(alice, "bob");
    await expect(respond(alice, friendship_id, true)).rejects.toThrow(/friendship_not_found/);
    await expect(respond(carol, friendship_id, true)).rejects.toThrow(/friendship_not_found/);
    expect(await respond(bob, friendship_id, true)).toBe("accepted");
    expect((await list(alice, "friends")).map((r) => r.username)).toEqual(["bob"]);
    expect(await list(alice, "outgoing")).toEqual([]);
  });

  it("removes a declined request, so it can be asked again", async () => {
    await clear();
    const { friendship_id } = await request(alice, "bob");
    expect(await respond(bob, friendship_id, false)).toBe("declined");
    expect(await list(bob, "incoming")).toEqual([]);
    expect((await request(alice, "bob")).status).toBe("pending");
  });

  it("cannot answer a request twice", async () => {
    await clear();
    const { friendship_id } = await request(alice, "bob");
    await respond(bob, friendship_id, true);
    await expect(respond(bob, friendship_id, true)).rejects.toThrow(/friendship_not_found/);
    await expect(respond(bob, friendship_id, false)).rejects.toThrow(/friendship_not_found/);
    expect((await list(bob, "friends")).map((r) => r.username)).toEqual(["alice"]);
  });

  it("refuses to accept past the friend limit, for either student", async () => {
    await clear();
    const first = await request(alice, "bob");
    await respond(bob, first.friendship_id, true);
    const second = await request(carol, "alice");
    await expect(respond(alice, second.friendship_id, true, 1)).rejects.toThrow(/friend_limit/);
    const third = await request(carol, "bob");
    await expect(respond(bob, third.friendship_id, true, 1)).rejects.toThrow(/friend_limit/);
    expect(await list(carol, "friends")).toEqual([]);
  });
});

describe("remove_friendship", () => {
  it("lets either friend end a friendship", async () => {
    await clear();
    const one = await request(alice, "bob");
    await respond(bob, one.friendship_id, true);
    await remove(bob, one.friendship_id);
    expect(await list(alice, "friends")).toEqual([]);

    const two = await request(alice, "bob");
    await respond(bob, two.friendship_id, true);
    await remove(alice, two.friendship_id);
    expect(await list(bob, "friends")).toEqual([]);
  });

  it("lets the asker withdraw a request", async () => {
    await clear();
    const { friendship_id } = await request(alice, "bob");
    await remove(alice, friendship_id);
    expect(await list(bob, "incoming")).toEqual([]);
  });

  it("refuses anyone who is not one of the two", async () => {
    await clear();
    const { friendship_id } = await request(alice, "bob");
    await expect(remove(carol, friendship_id)).rejects.toThrow(/friendship_not_found/);
    expect((await list(bob, "incoming")).length).toBe(1);
  });
});

describe("list_friendships", () => {
  it("shows a username and a date, never an email or an id of the other student", async () => {
    await clear();
    const { friendship_id } = await request(alice, "bob");
    await respond(bob, friendship_id, true);
    const [row] = await list(alice, "friends");
    expect(Object.keys(row).sort()).toEqual(["friendship_id", "since", "username"]);
    expect(row.friendship_id).toBe(friendship_id);
  });

  it("pages through the newest first", async () => {
    await clear();
    for (const [index, name] of ["bob", "carol", "dave"].entries()) {
      const { friendship_id } = await request(alice, name);
      await db.admin(
        `UPDATE public.friendships SET created_at = now() - make_interval(mins => $2) WHERE id = $1`,
        [friendship_id, 10 - index],
      );
    }
    expect((await list(alice, "outgoing", 2, 0)).map((r) => r.username)).toEqual(["dave", "carol"]);
    expect((await list(alice, "outgoing", 2, 2)).map((r) => r.username)).toEqual(["bob"]);
  });

  it("clamps an oversized page", async () => {
    await clear();
    expect(await list(alice, "friends", 100_000, 0)).toEqual([]);
  });

  it("rejects an unknown list kind", async () => {
    await expect(list(alice, "everyone" as "friends")).rejects.toThrow(/invalid_list_kind/);
  });
});

describe("access", () => {
  it("is closed to a signed-in student: no table reads or writes, no function calls", async () => {
    await clear();
    const { friendship_id } = await request(alice, "bob");
    await expect(db.as("authenticated", alice, `SELECT * FROM public.friendships`)).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      db.as("authenticated", alice, `UPDATE public.friendships SET status = 'accepted'`),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.as("authenticated", alice, `DELETE FROM public.friendships WHERE id = $1`, [
        friendship_id,
      ]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.as("authenticated", bob, `SELECT public.respond_friend_request($1, $2, true, 5)`, [
        bob,
        friendship_id,
      ]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.as("authenticated", alice, `SELECT * FROM public.list_friendships($1, 'friends', 10, 0)`, [
        alice,
      ]),
    ).rejects.toThrow(/permission denied/);
    await expect(db.as("anon", null, `SELECT * FROM public.friendships`)).rejects.toThrow(
      /permission denied/,
    );
  });

  it("keeps one row per pair whichever way it was asked", async () => {
    await clear();
    await request(alice, "bob");
    await expect(
      db.admin(`INSERT INTO public.friendships (requester_id, addressee_id) VALUES ($1, $2)`, [
        bob,
        alice,
      ]),
    ).rejects.toThrow(/duplicate key/);
    await expect(
      db.admin(`INSERT INTO public.friendships (requester_id, addressee_id) VALUES ($1, $1)`, [
        alice,
      ]),
    ).rejects.toThrow(/violates check constraint/);
  });

  it("removes a student's friendships with the student", async () => {
    await clear();
    const erin = await db.createUser("erin-fr@example.com");
    await db.admin(`UPDATE public.profiles SET username = 'erin' WHERE id = $1`, [erin]);
    await request(alice, "erin");
    await db.admin(`DELETE FROM auth.users WHERE id = $1`, [erin]);
    expect(await list(alice, "outgoing")).toEqual([]);
  });
});
