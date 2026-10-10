import { describe, expect, it, vi } from "vitest";
import { ValidationError } from "@/lib/app-errors";
import { MAX_OFFSET } from "../types";
import { NOTIFICATION_CONFIG } from "./notification.config";
import type { NotificationEvent, OutboxNotification } from "./notification";
import {
  type InboxEntry,
  type NotificationProvider,
  NotificationService,
} from "./notification.service";

const USER = "user-1";
const received: NotificationEvent = {
  kind: "friend_request_received",
  payload: { friendshipId: "f1", fromUsername: "alice" },
};
const outbox = (id: string, event: NotificationEvent = received): OutboxNotification => ({
  ...event,
  id,
  createdAt: new Date("2026-10-10T10:00:00.000Z"),
});
const entry = (id: string, readAt: Date | null = null): InboxEntry => ({
  id,
  event: received,
  createdAt: new Date("2026-10-10T10:00:00.000Z"),
  readAt,
});

function provider(name: string, behaviour: (id: string) => Promise<void> = async () => undefined) {
  return {
    name,
    deliver: vi.fn(async (_user: string, notification: OutboxNotification) =>
      behaviour(notification.id),
    ),
  } satisfies NotificationProvider;
}

function setup(
  options: {
    waiting?: OutboxNotification[];
    inbox?: InboxEntry[];
    providers?: NotificationProvider[];
    claimFails?: boolean;
  } = {},
) {
  const store = {
    claim: vi.fn(async (_user: string, _limits: unknown) => {
      if (options.claimFails) throw new Error("database is down");
      return options.waiting ?? [];
    }),
    markDispatched: vi.fn(async (_ids: readonly string[]) => undefined),
    recordFailure: vi.fn(async (_id: string, _message: string) => undefined),
    list: vi.fn(
      async (_user: string, page: { unreadOnly: boolean; limit: number; offset: number }) =>
        (options.inbox ?? []).slice(page.offset, page.offset + page.limit),
    ),
    countUnread: vi.fn(async (_user: string) => 3),
    markRead: vi.fn(async (_user: string, _ids: readonly string[] | null) => 2),
  };
  const providers = options.providers ?? [provider("in-app")];
  return { service: new NotificationService({ store, providers }), store, providers };
}

describe("NotificationService.dispatch", () => {
  it("hands each waiting notification to every provider, then marks them all delivered once", async () => {
    const first = provider("first");
    const second = provider("second");
    const { service, store } = setup({
      waiting: [outbox("n1"), outbox("n2")],
      providers: [first, second],
    });

    await service.dispatch(USER);

    expect(store.claim).toHaveBeenCalledWith(USER, {
      limit: NOTIFICATION_CONFIG.batchSize,
      maxAttempts: NOTIFICATION_CONFIG.maxAttempts,
      staleAfterSeconds: NOTIFICATION_CONFIG.staleAfterSeconds,
    });
    for (const p of [first, second]) {
      expect(p.deliver.mock.calls.map(([user, n]) => [user, n.id])).toEqual([
        [USER, "n1"],
        [USER, "n2"],
      ]);
    }
    expect(store.markDispatched).toHaveBeenCalledTimes(1);
    expect(store.markDispatched).toHaveBeenCalledWith(["n1", "n2"]);
    expect(store.recordFailure).not.toHaveBeenCalled();
  });

  it("does nothing when nothing is waiting", async () => {
    const { service, store, providers } = setup();
    await service.dispatch(USER);
    expect(store.markDispatched).not.toHaveBeenCalled();
    expect(providers[0].deliver).not.toHaveBeenCalled();
  });

  it("records a failed delivery, leaves it undelivered, and still delivers the others", async () => {
    const flaky = provider("in-app", async (id) => {
      if (id === "n1") throw new Error("inbox unavailable");
    });
    const { service, store } = setup({
      waiting: [outbox("n1"), outbox("n2")],
      providers: [flaky],
    });

    await service.dispatch(USER);

    expect(store.recordFailure).toHaveBeenCalledWith("n1", "in-app: inbox unavailable");
    expect(store.markDispatched).toHaveBeenCalledWith(["n2"]);
  });

  it("leaves a notification undelivered when any provider fails it, and names the provider", async () => {
    const good = provider("in-app");
    const bad = provider("email", async () => {
      throw new Error("smtp refused");
    });
    const { service, store } = setup({ waiting: [outbox("n1")], providers: [good, bad] });

    await service.dispatch(USER);

    expect(store.recordFailure).toHaveBeenCalledWith("n1", "email: smtp refused");
    expect(store.markDispatched).not.toHaveBeenCalled();
  });

  it("records a failure that is not an Error without losing it", async () => {
    const odd = provider("in-app", async () => {
      throw "just a string";
    });
    const { service, store } = setup({ waiting: [outbox("n1")], providers: [odd] });
    await service.dispatch(USER);
    expect(store.recordFailure).toHaveBeenCalledWith("n1", "in-app: delivery failed");
  });
});

describe("NotificationService.list", () => {
  it("delivers what is waiting first, then lists the student's notifications with their words", async () => {
    const { service, store } = setup({
      waiting: [outbox("n1")],
      inbox: [entry("n1"), entry("n0", new Date("2026-10-09T10:00:00.000Z"))],
    });

    const page = await service.list(USER, {});

    expect(store.claim.mock.invocationCallOrder[0]).toBeLessThan(
      store.list.mock.invocationCallOrder[0],
    );
    expect(page.nextOffset).toBeNull();
    expect(page.items).toEqual([
      {
        id: "n1",
        kind: "friend_request_received",
        message: "alice sent you a friend request.",
        data: { friendshipId: "f1", fromUsername: "alice" },
        createdAt: new Date("2026-10-10T10:00:00.000Z"),
        readAt: null,
      },
      expect.objectContaining({ id: "n0", readAt: new Date("2026-10-09T10:00:00.000Z") }),
    ]);
  });

  it("pages the inbox, asking for one row more than the page", async () => {
    const { service, store } = setup({ inbox: [entry("a"), entry("b"), entry("c")] });
    const page = await service.list(USER, { limit: 2, unreadOnly: true });
    expect(store.list).toHaveBeenCalledWith(USER, { unreadOnly: true, limit: 3, offset: 0 });
    expect(page.items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(page.nextOffset).toBe(2);
  });

  it("still lists the inbox when delivery fails", async () => {
    const { service, store } = setup({ claimFails: true, inbox: [entry("a")] });
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const page = await service.list(USER, {});
    expect(page.items.map((item) => item.id)).toEqual(["a"]);
    expect(store.list).toHaveBeenCalled();
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it("refuses a page beyond the limit on offsets, before delivering anything", async () => {
    const { service, store } = setup();
    await expect(service.list(USER, { offset: MAX_OFFSET + 1 })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(store.claim).not.toHaveBeenCalled();
  });
});

describe("NotificationService.unreadCount", () => {
  it("delivers what is waiting first, then counts", async () => {
    const { service, store } = setup({ waiting: [outbox("n1")] });
    expect(await service.unreadCount(USER)).toEqual({ unread: 3 });
    expect(store.claim.mock.invocationCallOrder[0]).toBeLessThan(
      store.countUnread.mock.invocationCallOrder[0],
    );
    expect(store.countUnread).toHaveBeenCalledWith(USER);
  });
});

describe("NotificationService.markRead", () => {
  it("marks the named notifications as the signed-in student", async () => {
    const { service, store } = setup();
    expect(await service.markRead(USER, { ids: ["n1", "n2"] })).toEqual({ marked: 2 });
    expect(store.markRead).toHaveBeenCalledWith(USER, ["n1", "n2"]);
  });

  it("marks every unread notification when no ids are given", async () => {
    const { service, store } = setup();
    await service.markRead(USER, {});
    expect(store.markRead).toHaveBeenCalledWith(USER, null);
  });
});
