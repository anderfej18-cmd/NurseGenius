import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { guard } from "../errors";
import { createNotifications } from "./notification.container.server";

const notifications = () => createNotifications(supabaseAdmin);

// The user id always comes from the verified JWT (requireSupabaseAuth), never from the request body.
export const notificationController = {
  list: (userId: string, input: { unreadOnly?: boolean; limit?: number; offset?: number }) =>
    guard(() => notifications().list(userId, input)),
  unreadCount: (userId: string) => guard(() => notifications().unreadCount(userId)),
  markRead: (userId: string, input: { ids?: string[] }) =>
    guard(() => notifications().markRead(userId, input)),
};
