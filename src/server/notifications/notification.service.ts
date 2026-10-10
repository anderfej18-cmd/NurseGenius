import { bestEffort } from "../errors";
import { offsetBounds, toOffsetPage } from "../pagination";
import type { OffsetPage } from "../types";
import {
  type NotificationEvent,
  type NotificationKind,
  type OutboxNotification,
  describeNotification,
} from "./notification";
import { NOTIFICATION_CONFIG, type NotificationConfig } from "./notification.config";

/** A way of telling a student: the in-app inbox today; email or push would be another provider. */
export interface NotificationProvider {
  readonly name: string;
  /** Must be safe to repeat for the same notification id (delivery can be retried). */
  deliver(userId: string, notification: OutboxNotification): Promise<void>;
}

/** A notification in the student's inbox. */
export interface InboxEntry {
  readonly id: string;
  readonly event: NotificationEvent;
  readonly createdAt: Date;
  readonly readAt: Date | null;
}

export interface NotificationItem {
  readonly id: string;
  readonly kind: NotificationKind;
  readonly message: string;
  readonly data: NotificationEvent["payload"];
  readonly createdAt: Date;
  readonly readAt: Date | null;
}

/** What this service needs from the rest of the system; declared here, next to its only consumer. */
interface Dependencies {
  readonly store: {
    claim(
      userId: string,
      limits: { limit: number; maxAttempts: number; staleAfterSeconds: number },
    ): Promise<readonly OutboxNotification[]>;
    markDispatched(ids: readonly string[]): Promise<void>;
    recordFailure(id: string, message: string): Promise<void>;
    list(
      userId: string,
      page: { unreadOnly: boolean; limit: number; offset: number },
    ): Promise<readonly InboxEntry[]>;
    countUnread(userId: string): Promise<number>;
    markRead(userId: string, ids: readonly string[] | null): Promise<number>;
  };
  readonly providers: readonly NotificationProvider[];
  readonly config?: NotificationConfig;
}

/**
 * Notifications. Events are written to an outbox by the database in the same transaction as the
 * change they report; this service hands waiting ones to every provider and marks them delivered,
 * which is safe to repeat (ADR-0005). Rules in docs/formulas.md (section 15).
 */
export class NotificationService {
  private readonly config: NotificationConfig;

  constructor(private readonly deps: Dependencies) {
    this.config = deps.config ?? NOTIFICATION_CONFIG;
  }

  /** Delivers the student's waiting notifications. One that fails stays waiting; the others go on. */
  async dispatch(userId: string): Promise<void> {
    const waiting = await this.deps.store.claim(userId, {
      limit: this.config.batchSize,
      maxAttempts: this.config.maxAttempts,
      staleAfterSeconds: this.config.staleAfterSeconds,
    });
    const delivered: string[] = [];
    for (const notification of waiting) {
      const failure = await this.deliver(userId, notification);
      if (failure === null) delivered.push(notification.id);
      else await this.deps.store.recordFailure(notification.id, failure);
    }
    if (delivered.length > 0) await this.deps.store.markDispatched(delivered);
  }

  async list(
    userId: string,
    request: { unreadOnly?: boolean; limit?: number; offset?: number },
  ): Promise<OffsetPage<NotificationItem>> {
    const { offset, limit } = offsetBounds(request);
    await this.catchUp(userId);
    const rows = await this.deps.store.list(userId, {
      unreadOnly: request.unreadOnly ?? false,
      limit: limit + 1,
      offset,
    });
    const page = toOffsetPage([...rows], limit, offset);
    return { items: page.items.map(toItem), nextOffset: page.nextOffset };
  }

  async unreadCount(userId: string): Promise<{ unread: number }> {
    await this.catchUp(userId);
    return { unread: await this.deps.store.countUnread(userId) };
  }

  /** Marks the named notifications (or all of them) read; ids that are not the student's are ignored. */
  async markRead(userId: string, input: { ids?: readonly string[] }): Promise<{ marked: number }> {
    return { marked: await this.deps.store.markRead(userId, input.ids ?? null) };
  }

  /** Reading must work even when delivery is down: a failure is logged and the inbox is shown as is. */
  private catchUp(userId: string): Promise<void> {
    return bestEffort(() => this.dispatch(userId), "notification delivery");
  }

  /** Returns null when every provider delivered, else the first failure, naming its provider. */
  private async deliver(userId: string, notification: OutboxNotification): Promise<string | null> {
    for (const provider of this.deps.providers) {
      try {
        await provider.deliver(userId, notification);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "delivery failed";
        return `${provider.name}: ${reason}`;
      }
    }
    return null;
  }
}

function toItem(entry: InboxEntry): NotificationItem {
  return {
    id: entry.id,
    kind: entry.event.kind,
    message: describeNotification(entry.event),
    data: entry.event.payload,
    createdAt: entry.createdAt,
    readAt: entry.readAt,
  };
}
