import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "../testing/fake-supabase";
import { InAppNotificationProvider } from "./in-app.provider.server";
import { SupabaseNotificationStore } from "./notification.repository.server";

const USER = "user-1";
const argsOf = (fake: ReturnType<typeof createFakeSupabase>, fn: string) =>
  fake.callsOn(`rpc:${fn}`, "args")[0].args[0];

describe("SupabaseNotificationStore.claim", () => {
  it("names the signed-in student and the limits, and parses each notification", async () => {
    const fake = createFakeSupabase([
      {
        data: [
          {
            id: "n1",
            kind: "friend_request_received",
            payload: { friendshipId: "f1", fromUsername: "alice" },
            created_at: "2026-10-10T10:00:00.000Z",
          },
          {
            id: "n2",
            kind: "challenge_declined",
            payload: { challengeId: "c1", username: "bob" },
            created_at: "2026-10-10T11:00:00.000Z",
          },
        ],
      },
    ]);
    const waiting = await new SupabaseNotificationStore(fake.client).claim(USER, {
      limit: 50,
      maxAttempts: 5,
      staleAfterSeconds: 300,
    });
    expect(argsOf(fake, "claim_notifications")).toEqual({
      _user_id: USER,
      _limit: 50,
      _max_attempts: 5,
      _stale_after_seconds: 300,
    });
    expect(waiting).toEqual([
      {
        id: "n1",
        kind: "friend_request_received",
        payload: { friendshipId: "f1", fromUsername: "alice" },
        createdAt: new Date("2026-10-10T10:00:00.000Z"),
      },
      {
        id: "n2",
        kind: "challenge_declined",
        payload: { challengeId: "c1", username: "bob" },
        createdAt: new Date("2026-10-10T11:00:00.000Z"),
      },
    ]);
  });

  it("fails loudly on a notification of an unknown kind or with the wrong facts", async () => {
    for (const row of [
      { kind: "prize_won", payload: {} },
      { kind: "friend_request_received", payload: { friendshipId: "f1" } },
    ]) {
      const fake = createFakeSupabase([
        { data: [{ id: "n1", created_at: "2026-10-10T10:00:00.000Z", ...row }] },
      ]);
      await expect(
        new SupabaseNotificationStore(fake.client).claim(USER, {
          limit: 1,
          maxAttempts: 1,
          staleAfterSeconds: 1,
        }),
      ).rejects.toThrow();
    }
  });

  it("surfaces a database error", async () => {
    const fake = createFakeSupabase([{ error: { message: "boom" } }]);
    await expect(
      new SupabaseNotificationStore(fake.client).claim(USER, {
        limit: 1,
        maxAttempts: 1,
        staleAfterSeconds: 1,
      }),
    ).rejects.toMatchObject({ message: "boom" });
  });
});

describe("SupabaseNotificationStore delivery bookkeeping", () => {
  it("marks the delivered ids", async () => {
    const fake = createFakeSupabase([{ data: null }]);
    await new SupabaseNotificationStore(fake.client).markDispatched(["n1", "n2"]);
    expect(argsOf(fake, "mark_notifications_dispatched")).toEqual({ _ids: ["n1", "n2"] });
  });

  it("records a failure against its notification", async () => {
    const fake = createFakeSupabase([{ data: null }]);
    await new SupabaseNotificationStore(fake.client).recordFailure("n1", "in-app: down");
    expect(argsOf(fake, "record_notification_failure")).toEqual({
      _id: "n1",
      _error: "in-app: down",
    });
  });
});

describe("SupabaseNotificationStore inbox", () => {
  it("lists for the signed-in student only, and parses each entry", async () => {
    const fake = createFakeSupabase([
      {
        data: [
          {
            id: "n1",
            kind: "challenge_received",
            payload: { challengeId: "c1", fromUsername: "alice", totalQuestions: 10 },
            created_at: "2026-10-10T10:00:00.000Z",
            read_at: null,
          },
          {
            id: "n0",
            kind: "friend_request_accepted",
            payload: { friendshipId: "f1", username: "bob" },
            created_at: "2026-10-09T10:00:00.000Z",
            read_at: "2026-10-09T12:00:00.000Z",
          },
        ],
      },
    ]);
    const entries = await new SupabaseNotificationStore(fake.client).list(USER, {
      unreadOnly: true,
      limit: 21,
      offset: 40,
    });
    expect(argsOf(fake, "list_notifications")).toEqual({
      _user_id: USER,
      _unread_only: true,
      _limit: 21,
      _offset: 40,
    });
    expect(entries).toEqual([
      {
        id: "n1",
        event: {
          kind: "challenge_received",
          payload: { challengeId: "c1", fromUsername: "alice", totalQuestions: 10 },
        },
        createdAt: new Date("2026-10-10T10:00:00.000Z"),
        readAt: null,
      },
      {
        id: "n0",
        event: {
          kind: "friend_request_accepted",
          payload: { friendshipId: "f1", username: "bob" },
        },
        createdAt: new Date("2026-10-09T10:00:00.000Z"),
        readAt: new Date("2026-10-09T12:00:00.000Z"),
      },
    ]);
  });

  it("counts for the signed-in student only", async () => {
    const fake = createFakeSupabase([{ data: 4 }]);
    expect(await new SupabaseNotificationStore(fake.client).countUnread(USER)).toBe(4);
    expect(argsOf(fake, "count_unread_notifications")).toEqual({ _user_id: USER });
  });

  it("marks the named ids, or every unread one when none are named", async () => {
    const named = createFakeSupabase([{ data: 2 }]);
    expect(await new SupabaseNotificationStore(named.client).markRead(USER, ["n1", "n2"])).toBe(2);
    expect(argsOf(named, "mark_notifications_read")).toEqual({
      _user_id: USER,
      _ids: ["n1", "n2"],
    });

    const all = createFakeSupabase([{ data: 7 }]);
    expect(await new SupabaseNotificationStore(all.client).markRead(USER, null)).toBe(7);
    expect(argsOf(all, "mark_notifications_read")).toEqual({ _user_id: USER });
  });
});

describe("InAppNotificationProvider", () => {
  const notification = {
    id: "n1",
    kind: "friend_request_received",
    payload: { friendshipId: "f1", fromUsername: "alice" },
    createdAt: new Date("2026-10-10T10:00:00.000Z"),
  } as const;

  it("writes the student's inbox row under the outbox id, ignoring a repeat", async () => {
    const fake = createFakeSupabase([{ data: null }]);
    await new InAppNotificationProvider(fake.client).deliver(USER, notification);
    expect(fake.callsOn("from:notifications", "upsert")[0].args).toEqual([
      {
        id: "n1",
        user_id: USER,
        kind: "friend_request_received",
        payload: { friendshipId: "f1", fromUsername: "alice" },
        created_at: "2026-10-10T10:00:00.000Z",
      },
      { onConflict: "id", ignoreDuplicates: true },
    ]);
  });

  it("fails when the inbox cannot be written, so the notification stays waiting", async () => {
    const fake = createFakeSupabase([{ error: { message: "inbox down" } }]);
    await expect(
      new InAppNotificationProvider(fake.client).deliver(USER, notification),
    ).rejects.toMatchObject({ message: "inbox down" });
  });
});
