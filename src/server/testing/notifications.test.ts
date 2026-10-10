import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addQuestion, serviceCall } from "./fixtures";
import { createTestDb, type TestDb } from "./pglite-db";

let db: TestDb;
let alice: string;
let bob: string;
let carol: string;
let questions: string[];

interface Pending {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  created_at: string;
}

const pending = (userId: string) =>
  db.admin<{ kind: string; payload: Record<string, unknown> }>(
    `SELECT kind, payload FROM public.notification_outbox WHERE user_id = $1 ORDER BY created_at, id`,
    [userId],
  );
const claim = (userId: string, limit = 50, maxAttempts = 3, staleSeconds = 300) =>
  serviceCall<Pending>(db, `SELECT * FROM public.claim_notifications($1, $2, $3, $4)`, [
    userId,
    limit,
    maxAttempts,
    staleSeconds,
  ]);
const markDispatched = (ids: string[]) =>
  serviceCall(db, `SELECT public.mark_notifications_dispatched($1::uuid[])`, [
    `{${ids.join(",")}}`,
  ]);
const inbox = (id: string, userId: string, kind = "friend_request_received", createdAt?: string) =>
  db.admin(
    `INSERT INTO public.notifications (id, user_id, kind, payload, created_at)
     VALUES ($1, $2, $3, '{}'::jsonb, COALESCE($4::timestamptz, now()))`,
    [id, userId, kind, createdAt ?? null],
  );
const list = (userId: string, unreadOnly = false, limit = 50, offset = 0) =>
  serviceCall<{ id: string; kind: string; read_at: string | null }>(
    db,
    `SELECT * FROM public.list_notifications($1, $2, $3, $4)`,
    [userId, unreadOnly, limit, offset],
  );
const unread = (userId: string) =>
  serviceCall<{ n: number }>(db, `SELECT public.count_unread_notifications($1) AS n`, [
    userId,
  ]).then((rows) => rows[0].n);
const markRead = (userId: string, ids: string[] | null) =>
  serviceCall<{ n: number }>(db, `SELECT public.mark_notifications_read($1, $2::uuid[]) AS n`, [
    userId,
    ids === null ? null : `{${ids.join(",")}}`,
  ]).then((rows) => rows[0].n);
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const reset = async () => {
  await db.admin(`DELETE FROM public.notification_outbox`);
  await db.admin(`DELETE FROM public.notifications`);
  await db.admin(`DELETE FROM public.friend_challenges`);
  await db.admin(`DELETE FROM public.friendships`);
  await db.admin(`DELETE FROM public.exam_answers`);
  await db.admin(`DELETE FROM public.exams`);
};
const ask = (from: string, toName: string) =>
  serviceCall<{ friendship_id: string }>(
    db,
    `SELECT * FROM public.request_friend($1, $2, 10, 10)`,
    [from, toName],
  ).then((rows) => rows[0].friendship_id);
const befriend = async (from: string, to: string, toName: string) => {
  const id = await ask(from, toName);
  await serviceCall(db, `SELECT public.respond_friend_request($1, $2, true, 10)`, [to, id]);
  return id;
};

beforeAll(async () => {
  db = await createTestDb();
  [alice, bob, carol] = await Promise.all(
    ["alice", "bob", "carol"].map((name) => db.createUser(`${name}-nt@example.com`)),
  );
  for (const [id, name] of [
    [alice, "alice"],
    [bob, "bob"],
    [carol, "carol"],
  ]) {
    await db.admin(`UPDATE public.profiles SET username = $2 WHERE id = $1`, [id, name]);
  }
  questions = await Promise.all(Array.from({ length: 3 }, () => addQuestion(db, { correct: "A" })));
});
afterAll(() => db.pg.close());

describe("events that become notifications", () => {
  it("tells a student who was asked to be a friend, and nobody else", async () => {
    await reset();
    const friendshipId = await ask(alice, "bob");
    expect(await pending(bob)).toEqual([
      { kind: "friend_request_received", payload: { friendshipId, fromUsername: "alice" } },
    ]);
    expect(await pending(alice)).toEqual([]);
    expect(await pending(carol)).toEqual([]);
  });

  it("tells the asker when the request is accepted, but says nothing when it is declined", async () => {
    await reset();
    const accepted = await ask(alice, "bob");
    await serviceCall(db, `SELECT public.respond_friend_request($1, $2, true, 10)`, [
      bob,
      accepted,
    ]);
    expect((await pending(alice)).map((row) => row)).toEqual([
      { kind: "friend_request_accepted", payload: { friendshipId: accepted, username: "bob" } },
    ]);

    await reset();
    const declined = await ask(alice, "bob");
    await serviceCall(db, `SELECT public.respond_friend_request($1, $2, false, 10)`, [
      bob,
      declined,
    ]);
    expect(await pending(alice)).toEqual([]);
  });

  it("tells the original asker when asking back makes the friendship", async () => {
    await reset();
    const friendshipId = await ask(alice, "bob");
    await ask(bob, "alice");
    expect((await pending(alice)).map((row) => row.kind)).toEqual(["friend_request_accepted"]);
    expect(await pending(alice)).toEqual([
      { kind: "friend_request_accepted", payload: { friendshipId, username: "bob" } },
    ]);
  });

  it("tells a student they were challenged, and the challenger when it is declined", async () => {
    await reset();
    const friendship = await befriend(alice, bob, "bob");
    await db.admin(`DELETE FROM public.notification_outbox`);
    const [{ id: challengeId }] = await serviceCall<{ id: string }>(
      db,
      `SELECT public.create_friend_challenge($1, $2, 'RN', $3::uuid[], now() + interval '7 days', 10) AS id`,
      [alice, friendship, `{${questions.join(",")}}`],
    );
    expect(await pending(bob)).toEqual([
      {
        kind: "challenge_received",
        payload: { challengeId, fromUsername: "alice", totalQuestions: 3 },
      },
    ]);
    expect(await pending(alice)).toEqual([]);

    await serviceCall(db, `SELECT public.decline_friend_challenge($1, $2)`, [bob, challengeId]);
    expect(await pending(alice)).toEqual([
      { kind: "challenge_declined", payload: { challengeId, username: "bob" } },
    ]);
  });

  it("writes the notification in the same transaction as the change, so a failed change leaves none", async () => {
    await reset();
    await ask(alice, "bob");
    await expect(ask(alice, "bob")).rejects.toThrow(/request_pending/);
    expect((await pending(bob)).length).toBe(1);
  });

  it("refuses a notification of a kind that does not exist, or a payload that is not an object", async () => {
    await expect(
      db.admin(
        `INSERT INTO public.notification_outbox (user_id, kind, payload) VALUES ($1, 'other', '{}')`,
        [alice],
      ),
    ).rejects.toThrow(/violates check constraint/);
    await expect(
      db.admin(
        `INSERT INTO public.notification_outbox (user_id, kind, payload) VALUES ($1, 'friend_request_received', '[]')`,
        [alice],
      ),
    ).rejects.toThrow(/violates check constraint/);
  });
});

describe("claim_notifications", () => {
  it("hands over a student's waiting notifications, oldest first, and counts the attempt", async () => {
    await reset();
    await ask(alice, "bob");
    await ask(carol, "bob");
    const claimed = await claim(bob);
    expect(claimed.map((row) => row.payload.fromUsername)).toEqual(["alice", "carol"]);
    const rows = await db.admin<{ attempts: number; claimed_at: string | null }>(
      `SELECT attempts, claimed_at FROM public.notification_outbox WHERE user_id = $1`,
      [bob],
    );
    expect(rows.every((row) => row.attempts === 1 && row.claimed_at !== null)).toBe(true);
  });

  it("does not hand over the same notification again while it is being delivered", async () => {
    await reset();
    await ask(alice, "bob");
    expect((await claim(bob)).length).toBe(1);
    expect(await claim(bob)).toEqual([]);
  });

  it("hands it over again when delivery has gone quiet for longer than the allowed time", async () => {
    await reset();
    await ask(alice, "bob");
    await claim(bob);
    await db.admin(
      `UPDATE public.notification_outbox SET claimed_at = now() - interval '10 minutes'`,
    );
    expect((await claim(bob, 50, 3, 300)).length).toBe(1);
  });

  it("gives up after the allowed number of attempts", async () => {
    await reset();
    await ask(alice, "bob");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect((await claim(bob, 50, 2, 0)).length).toBe(1);
    }
    expect(await claim(bob, 50, 2, 0)).toEqual([]);
  });

  it("takes only the student's own, and no more than the limit", async () => {
    await reset();
    await ask(alice, "bob");
    await ask(carol, "bob");
    await ask(bob, "alice");
    expect((await claim(bob, 1)).length).toBe(1);
    expect((await claim(alice)).length).toBe(1);
    expect((await claim(carol)).length).toBe(0);
  });

  it("does not hand over what was delivered", async () => {
    await reset();
    await ask(alice, "bob");
    const [row] = await claim(bob);
    await markDispatched([row.id]);
    await db.admin(`UPDATE public.notification_outbox SET claimed_at = NULL`);
    expect(await claim(bob)).toEqual([]);
    const [stored] = await db.admin<{ dispatched_at: string | null }>(
      `SELECT dispatched_at FROM public.notification_outbox`,
    );
    expect(stored.dispatched_at).not.toBeNull();
  });

  it("records why a delivery failed, shortened, and leaves it to be tried again", async () => {
    await reset();
    await ask(alice, "bob");
    const [row] = await claim(bob);
    await serviceCall(db, `SELECT public.record_notification_failure($1, $2)`, [
      row.id,
      "x".repeat(2000),
    ]);
    const [stored] = await db.admin<{ last_error: string; dispatched_at: string | null }>(
      `SELECT last_error, dispatched_at FROM public.notification_outbox`,
    );
    expect(stored.last_error.length).toBeLessThanOrEqual(500);
    expect(stored.dispatched_at).toBeNull();
  });
});

describe("the inbox", () => {
  it("lists a student's notifications newest first, a page at a time", async () => {
    await reset();
    await inbox(uuid(1), bob, "friend_request_received", "2026-10-01T10:00:00Z");
    await inbox(uuid(2), bob, "challenge_received", "2026-10-02T10:00:00Z");
    await inbox(uuid(3), bob, "friend_request_accepted", "2026-10-03T10:00:00Z");
    await inbox(uuid(4), alice);
    expect((await list(bob)).map((row) => row.id)).toEqual([uuid(3), uuid(2), uuid(1)]);
    expect((await list(bob, false, 2, 0)).map((row) => row.id)).toEqual([uuid(3), uuid(2)]);
    expect((await list(bob, false, 2, 2)).map((row) => row.id)).toEqual([uuid(1)]);
    expect(await list(carol)).toEqual([]);
  });

  it("clamps an oversized page", async () => {
    await reset();
    expect(await list(bob, false, 100_000, 0)).toEqual([]);
  });

  it("counts and lists the unread ones", async () => {
    await reset();
    await inbox(uuid(1), bob);
    await inbox(uuid(2), bob);
    await markRead(bob, [uuid(1)]);
    expect(await unread(bob)).toBe(1);
    expect((await list(bob, true)).map((row) => row.id)).toEqual([uuid(2)]);
    expect(await unread(carol)).toBe(0);
  });

  it("marks only the student's own notifications as read, and only once", async () => {
    await reset();
    await inbox(uuid(1), bob);
    await inbox(uuid(2), alice);
    expect(await markRead(bob, [uuid(1), uuid(2)])).toBe(1);
    expect(await markRead(bob, [uuid(1)])).toBe(0);
    expect(await unread(alice)).toBe(1);
  });

  it("marks every unread notification when no ids are given", async () => {
    await reset();
    await inbox(uuid(1), bob);
    await inbox(uuid(2), bob);
    await inbox(uuid(3), alice);
    expect(await markRead(bob, null)).toBe(2);
    expect(await unread(bob)).toBe(0);
    expect(await unread(alice)).toBe(1);
  });

  it("keeps one inbox row for one outbox notification, however often it is delivered", async () => {
    await reset();
    await inbox(uuid(1), bob);
    await expect(inbox(uuid(1), bob)).rejects.toThrow(/duplicate key/);
  });
});

describe("access", () => {
  it("is closed to a signed-in student: no table reads or writes, no function calls", async () => {
    await reset();
    await ask(alice, "bob");
    await inbox(uuid(1), bob);
    for (const table of ["notification_outbox", "notifications"]) {
      await expect(db.as("authenticated", bob, `SELECT * FROM public.${table}`)).rejects.toThrow(
        /permission denied/,
      );
      await expect(db.as("anon", null, `SELECT * FROM public.${table}`)).rejects.toThrow(
        /permission denied/,
      );
    }
    await expect(
      db.as("authenticated", bob, `UPDATE public.notifications SET read_at = now()`),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.as("authenticated", bob, `SELECT * FROM public.list_notifications($1, false, 10, 0)`, [
        bob,
      ]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.as("authenticated", bob, `SELECT * FROM public.claim_notifications($1, 10, 3, 300)`, [
        bob,
      ]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.as("authenticated", bob, `SELECT public.mark_notifications_read($1, NULL)`, [bob]),
    ).rejects.toThrow(/permission denied/);
  });

  it("removes a student's notifications with the student", async () => {
    await reset();
    const dave = await db.createUser("dave-nt@example.com");
    await inbox(uuid(9), dave);
    await db.admin(
      `INSERT INTO public.notification_outbox (user_id, kind, payload) VALUES ($1, 'challenge_declined', '{}')`,
      [dave],
    );
    await db.admin(`DELETE FROM auth.users WHERE id = $1`, [dave]);
    expect(await db.admin(`SELECT 1 FROM public.notifications WHERE user_id = $1`, [dave])).toEqual(
      [],
    );
    expect(
      await db.admin(`SELECT 1 FROM public.notification_outbox WHERE user_id = $1`, [dave]),
    ).toEqual([]);
  });
});
