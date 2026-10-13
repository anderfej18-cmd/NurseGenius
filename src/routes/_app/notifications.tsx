import { Link, createFileRoute } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { LoadFailed } from "@/components/app/LoadFailed";
import { SignedInPage } from "@/components/SignedInPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { listNotifications, markNotificationsRead } from "@/functions/notifications.functions";
import { usePagedList } from "@/hooks/use-paged-list";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/notifications")({
  component: Notifications,
  head: () => ({
    meta: [
      { title: "Notifications | NurseGenius" },
      { name: "description", content: "Friend requests and challenges." },
    ],
  }),
});

type Page = Awaited<ReturnType<typeof listNotifications>>;
type Item = Page["items"][number];

const when = (value: Date | string) =>
  new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

function Notifications() {
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(new Set());
  const list = usePagedList<Item>((offset) => {
    if (offset === undefined) setReadIds(new Set());
    return listNotifications({ data: { limit: 20, ...(offset === undefined ? {} : { offset }) } });
  }, []);
  const { first, items } = list;
  const unread = items.filter((item) => item.readAt === null && !readIds.has(item.id));
  const [marking, setMarking] = useState(false);

  const markRead = async (ids?: string[]) => {
    if (ids === undefined) setMarking(true);
    try {
      await markNotificationsRead({ data: ids === undefined ? {} : { ids } });
      setReadIds((current) => new Set([...current, ...(ids ?? items.map((item) => item.id))]));
    } catch (error) {
      toast.error((error as Error).message);
    }
    setMarking(false);
  };

  return (
    <SignedInPage title="Notifications" description="Friend requests and challenges.">
      {() => (
        <>
          {unread.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {unread.length} unread {unread.length === 1 ? "notification" : "notifications"}
              </p>
              <Button variant="outline" size="sm" loading={marking} onClick={() => void markRead()}>
                Mark all as read
              </Button>
            </div>
          )}
          {first.error && !first.data && <LoadFailed load={first} label="Your notifications" />}
          {first.loading && items.length === 0 && !first.error && (
            <div aria-busy="true" className="flex flex-col gap-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}
          {!first.loading && !first.error && items.length === 0 && (
            <EmptyState
              icon={Bell}
              title="You have no notifications"
              description="Friend requests and challenges show up here."
            />
          )}
          <ul className="flex flex-col gap-3">
            {items.map((item) => {
              const isNew = item.readAt === null && !readIds.has(item.id);
              return (
                <li key={item.id}>
                  <Card className={cn("p-4", isNew && "border-primary/50 bg-accent")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {/* The message carries a username as plain text; React escapes it. */}
                        <p className="text-sm font-medium">{item.message}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{when(item.createdAt)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {isNew && <Badge>New</Badge>}
                        <Button asChild size="sm" variant="ghost">
                          <Link to="/friends" onClick={() => void markRead([item.id])}>
                            Open
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
          {list.hasMore && (
            <div>
              <Button
                variant="outline"
                loading={list.loadingMore}
                onClick={() => void list.loadMore()}
              >
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </SignedInPage>
  );
}
