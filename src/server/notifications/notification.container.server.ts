import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { InAppNotificationProvider } from "./in-app.provider.server";
import { SupabaseNotificationStore } from "./notification.repository.server";
import { NotificationService } from "./notification.service";

/**
 * Wires the notification service to the database. The in-app inbox is the only provider; another
 * one (email, push) is added to this list and nowhere else.
 */
export function createNotifications(db: SupabaseClient<Database>) {
  return new NotificationService({
    store: new SupabaseNotificationStore(db),
    providers: [new InAppNotificationProvider(db)],
  });
}
