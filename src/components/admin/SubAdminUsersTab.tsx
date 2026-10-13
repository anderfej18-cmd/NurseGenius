import { Users } from "lucide-react";
import { useState } from "react";
import { TierGroup } from "@/components/admin/TierGroup";
import { LoadFailed } from "@/components/app/LoadFailed";
import { StatTile } from "@/components/app/StatTile";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { getUserDirectory } from "@/functions/user-directory.functions";
import { usePagedList } from "@/hooks/use-paged-list";
import { TIERS } from "@/lib/admin-view";
import { TIER_LABEL, type Tier } from "@/lib/exam-rules";

type Directory = Awaited<ReturnType<typeof getUserDirectory>>;
type Totals = Directory["totals"];
type Person = Directory["users"][number];

const PAGE_SIZE = 50;

/** What an admin who is not the central admin may see of the students: usernames, grouped by plan, with totals. */
export function SubAdminUsersTab() {
  const [totals, setTotals] = useState<Totals | null>(null);
  const list = usePagedList<Person>(async (offset) => {
    const page = await getUserDirectory({ data: { limit: PAGE_SIZE, offset: offset ?? 0 } });
    setTotals(page.totals);
    return { items: page.users, nextOffset: page.nextOffset };
  }, []);
  const { first, items } = list;

  if (first.error && !first.data) return <LoadFailed load={first} label="The user list" />;
  if (!first.data || totals === null)
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        <span className="sr-only">Loading users</span>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="All users" value={totals.all.toLocaleString()} />
        {TIERS.map((tier) => (
          <StatTile key={tier} label={TIER_LABEL[tier]} value={totals[tier].toLocaleString()} />
        ))}
      </div>

      {totals.all === 0 ? (
        <EmptyState
          icon={Users}
          title="No users yet"
          description="People appear here once they have registered."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {TIERS.map((tier) => (
            <TierGroup key={tier} tier={tier} count={totals[tier].toLocaleString()}>
              <TierNames tier={tier} people={items} total={totals[tier]} />
            </TierGroup>
          ))}
          <p className="text-sm text-muted-foreground">
            Showing {items.length.toLocaleString()} of {totals.all.toLocaleString()} users.
          </p>
          {list.hasMore && (
            <div>
              <Button
                variant="outline"
                loading={list.loadingMore}
                onClick={() => void list.loadMore()}
              >
                Load more users
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TierNames({
  tier,
  people,
  total,
}: {
  tier: Tier;
  people: readonly Person[];
  total: number;
}) {
  const inTier = people.filter((person) => person.tier === tier);
  if (inTier.length === 0)
    return (
      <p className="px-4 py-6 text-center text-sm text-muted-foreground">
        {total === 0 ? `No one is on ${TIER_LABEL[tier]}.` : "None of them are loaded yet."}
      </p>
    );
  return (
    <ul className="divide-y divide-divider">
      {inTier.map((person, index) => (
        <li
          key={`${person.username ?? "user"}-${index}`}
          className="break-words px-4 py-3 text-sm font-medium"
        >
          {person.username || "Unnamed user"}
        </li>
      ))}
    </ul>
  );
}
