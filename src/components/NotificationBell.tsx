import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { getUnreadNotificationCount } from "@/functions/notifications.functions";
import { useAuth } from "@/hooks/use-auth";
import { useServerData } from "@/hooks/use-server-data";

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
      size="icon"
      variant="ghost"
      aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
    >
      <Link to="/notifications" className="relative">
        <Bell />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 font-mono text-[10px] font-semibold leading-none text-destructive-foreground"
          >
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
