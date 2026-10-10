import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { OutboxNotification } from "./notification";
import type { NotificationProvider } from "./notification.service";

/**
 * Puts a notification in the student's inbox. The inbox row reuses the outbox id, so delivering the
 * same notification again (a crash before it was marked delivered) leaves one row.
 */
export class InAppNotificationProvider implements NotificationProvider {
  readonly name = "in-app";

  constructor(private readonly db: SupabaseClient<Database>) {}

  async deliver(userId: string, notification: OutboxNotification): Promise<void> {
    const { error } = await this.db.from("notifications").upsert(
      {
        id: notification.id,
        user_id: userId,
        kind: notification.kind,
        payload: notification.payload,
        created_at: notification.createdAt.toISOString(),
      },
      { onConflict: "id", ignoreDuplicates: true },
    );
    if (error) throw error;
  }
}
