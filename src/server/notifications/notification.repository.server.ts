import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import type { NotificationEvent, OutboxNotification } from "./notification";
import type { InboxEntry } from "./notification.service";

// Mirrors NotificationEvent. A row that does not match is a bug or a bad migration: fail loudly.
const eventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("friend_request_received"),
    payload: z.object({ friendshipId: z.string(), fromUsername: z.string() }),
  }),
  z.object({
    kind: z.literal("friend_request_accepted"),
    payload: z.object({ friendshipId: z.string(), username: z.string() }),
  }),
  z.object({
    kind: z.literal("challenge_received"),
    payload: z.object({
      challengeId: z.string(),
      fromUsername: z.string(),
      totalQuestions: z.number(),
    }),
  }),
  z.object({
    kind: z.literal("challenge_declined"),
    payload: z.object({ challengeId: z.string(), username: z.string() }),
  }),
]) satisfies z.ZodType<NotificationEvent>;

// The event is parsed on its own so the result stays the NotificationEvent union.
const eventFieldsSchema = z.object({ kind: z.string(), payload: z.unknown() });
const claimedSchema = z.array(
  eventFieldsSchema.extend({ id: z.string(), created_at: z.coerce.date() }),
);
const inboxSchema = z.array(
  eventFieldsSchema.extend({
    id: z.string(),
    created_at: z.coerce.date(),
    read_at: z.coerce.date().nullable(),
  }),
);

/**
 * Notification outbox and inbox. Service-role client: students cannot read either table, and every
 * database function takes the student explicitly.
 */
export class SupabaseNotificationStore {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async claim(
    userId: string,
    limits: { limit: number; maxAttempts: number; staleAfterSeconds: number },
  ): Promise<OutboxNotification[]> {
    const { data, error } = await this.db.rpc("claim_notifications", {
      _user_id: userId,
      _limit: limits.limit,
      _max_attempts: limits.maxAttempts,
      _stale_after_seconds: limits.staleAfterSeconds,
    });
    if (error) throw error;
    return claimedSchema.parse(data).map((row) => ({
      ...eventSchema.parse({ kind: row.kind, payload: row.payload }),
      id: row.id,
      createdAt: row.created_at,
    }));
  }

  async markDispatched(ids: readonly string[]): Promise<void> {
    const { error } = await this.db.rpc("mark_notifications_dispatched", { _ids: [...ids] });
    if (error) throw error;
  }

  async recordFailure(id: string, message: string): Promise<void> {
    const { error } = await this.db.rpc("record_notification_failure", {
      _id: id,
      _error: message,
    });
    if (error) throw error;
  }

  async list(
    userId: string,
    page: { unreadOnly: boolean; limit: number; offset: number },
  ): Promise<InboxEntry[]> {
    const { data, error } = await this.db.rpc("list_notifications", {
      _user_id: userId,
      _unread_only: page.unreadOnly,
      _limit: page.limit,
      _offset: page.offset,
    });
    if (error) throw error;
    return inboxSchema.parse(data).map((row) => ({
      id: row.id,
      event: eventSchema.parse({ kind: row.kind, payload: row.payload }),
      createdAt: row.created_at,
      readAt: row.read_at,
    }));
  }

  async countUnread(userId: string): Promise<number> {
    const { data, error } = await this.db.rpc("count_unread_notifications", { _user_id: userId });
    if (error) throw error;
    return z.number().parse(data);
  }

  async markRead(userId: string, ids: readonly string[] | null): Promise<number> {
    const { data, error } = await this.db.rpc("mark_notifications_read", {
      _user_id: userId,
      ...(ids === null ? {} : { _ids: [...ids] }),
    });
    if (error) throw error;
    return z.number().parse(data);
  }
}
