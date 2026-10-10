import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { emptySchema } from "./common.schemas";
import { listNotificationsSchema, markNotificationsReadSchema } from "./notifications.schemas";
import { validated } from "./validated";

// Client-safe module (AGENTS.md): server code is loaded with a dynamic import inside each handler.
// Reads are POST because they first deliver whatever is waiting (ADR-0005).

/** The signed-in student's notifications, newest first, a page at a time. */
export const listNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(listNotificationsSchema))
  .handler(async ({ data, context }) => {
    const { notificationController } =
      await import("@/server/notifications/notification.controller.server");
    return notificationController.list(context.userId, data);
  });

/** How many notifications the signed-in student has not read. */
export const getUnreadNotificationCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(emptySchema))
  .handler(async ({ context }) => {
    const { notificationController } =
      await import("@/server/notifications/notification.controller.server");
    return notificationController.unreadCount(context.userId);
  });

/** Marks the named notifications, or every unread one, as read. Ids that are not theirs are ignored. */
export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(markNotificationsReadSchema))
  .handler(async ({ data, context }) => {
    const { notificationController } =
      await import("@/server/notifications/notification.controller.server");
    return notificationController.markRead(context.userId, data);
  });
