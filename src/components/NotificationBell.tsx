import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { Bell } from "lucide-react";
import { getUnreadNotificationCount } from "@/functions/notifications.functions";
import { useAuth } from "@/hooks/use-auth";
import { useServerData } from "@/hooks/use-server-data";
import { Button } from "@/components/ui/button";

const REFRESH_MS = 60_000;

/** A bell with the number of unread notifications; refreshes once a minute while the page is open. */
export function NotificationBell() {
  const { user } = useAuth();
  const count = useServerData(() => getUnreadNotificationCount({ data: {} }), [user?.id], !!user);

  // A failed count is simply not shown; the notifications page reports real errors.
  const unread = count.data?.unread ?? 0;
  useRefresh(count.reload, !!user);

  return (
    <Button
      asChild
      size="sm"
      variant="ghost"
      aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
    >
      <Link to="/notifications" className="relative">
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] leading-4 text-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>
    </Button>
  );
}

function useRefresh(reload: () => Promise<void>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      if (!document.hidden) void reload();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [reload, enabled]);
}
