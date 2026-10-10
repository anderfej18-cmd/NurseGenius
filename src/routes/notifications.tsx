import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { SignedInPage } from "@/components/SignedInPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listNotifications, markNotificationsRead } from "@/functions/notifications.functions";
import { useServerData } from "@/hooks/use-server-data";

export const Route = createFileRoute("/notifications")({
  component: Notifications,
  head: () => ({
    meta: [
      { title: "Notifications — NurseGenius" },
      { name: "description", content: "Friend requests and challenges." },
    ],
  }),
});

type Page = Awaited<ReturnType<typeof listNotifications>>;
type Item = Page["items"][number];

const when = (value: Date | string) => new Date(value).toLocaleString();

function Notifications() {
  const [extra, setExtra] = useState<Item[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(new Set());
  const first = useServerData(async () => {
    const page = await listNotifications({ data: { limit: 20 } });
    setExtra([]);
    setReadIds(new Set());
    setNext(page.nextOffset);
    return page;
  }, []);

  const items = [...(first.data?.items ?? []), ...extra];
  const unread = items.filter((item) => item.readAt === null && !readIds.has(item.id));

  const more = async () => {
    if (next === null) return;
    try {
      const page = await listNotifications({ data: { limit: 20, offset: next } });
      setExtra((current) => [...current, ...page.items]);
      setNext(page.nextOffset);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const markRead = async (ids?: string[]) => {
    try {
      await markNotificationsRead({ data: ids === undefined ? {} : { ids } });
      setReadIds((current) => new Set([...current, ...(ids ?? items.map((item) => item.id))]));
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <SignedInPage title="Notifications" description="Friend requests and challenges.">
      {() => (
        <>
          {unread.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => void markRead()}>
              Mark all as read
            </Button>
          )}
          {first.error && <p className="text-destructive text-sm">{first.error}</p>}
          {first.loading && <p className="text-muted-foreground text-sm">Loading…</p>}
          {!first.loading && !first.error && items.length === 0 && (
            <Card className="p-6 text-center text-muted-foreground text-sm">
              You have no notifications.
            </Card>
          )}
          {items.map((item) => {
            const isNew = item.readAt === null && !readIds.has(item.id);
            return (
              <Card
                key={item.id}
                className={`p-4 ${isNew ? "border-primary/50 bg-primary/5" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    {/* The message carries a username as plain text; React escapes it. */}
                    <p className="text-sm font-medium">{item.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">{when(item.createdAt)}</p>
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
            );
          })}
          {next !== null && (
            <Button variant="outline" onClick={() => void more()}>
              Load more
            </Button>
          )}
        </>
      )}
    </SignedInPage>
  );
}
