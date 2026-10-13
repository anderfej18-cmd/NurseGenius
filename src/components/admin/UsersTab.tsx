import { Search, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AssignTierDialog } from "@/components/admin/AssignTierDialog";
import { TierGroup } from "@/components/admin/TierGroup";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { LoadFailed } from "@/components/app/LoadFailed";
import { StatTile } from "@/components/app/StatTile";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerData } from "@/hooks/use-server-data";
import { supabase } from "@/integrations/supabase/client";
import { averageScores, matchesUser, TIERS } from "@/lib/admin-view";
import { TIER_LABEL, type Tier } from "@/lib/exam-rules";

interface Account {
  id: string;
  email: string | null;
  username: string | null;
  tier: Tier;
  expiry_date: string | null;
}

const PAGE_SIZE = 1000;

/** Every profile and every finished test's score, read in full (admins may read both tables). */
async function loadAccounts() {
  const accounts: Account[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, username, tier, expiry_date")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    accounts.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  const { data: exams, error } = await supabase
    .from("exams")
    .select("user_id, score_pct")
    .eq("status", "completed")
    .not("score_pct", "is", null);
  if (error) throw new Error(error.message);
  return { accounts, scores: averageScores(exams ?? []) };
}

/** Find a student, see their plan and average score, give them a plan or take it away. */
export function UsersTab() {
  const users = useServerData(loadAccounts, []);
  const [query, setQuery] = useState("");

  const revoke = async (account: Account): Promise<boolean> => {
    const { error } = await supabase.rpc("assign_user_tier", {
      _user_id: account.id,
      _tier: "novice",
      _days: 0,
    });
    if (error) {
      toast.error(error.message);
      return false;
    }
    toast.success(`${account.username ?? "The student"} is back on Novice.`);
    await users.reload();
    return true;
  };

  if (users.error && !users.data) return <LoadFailed load={users} label="The user list" />;
  if (!users.data)
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        <span className="sr-only">Loading users</span>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );

  const { accounts, scores } = users.data;
  const shown = accounts.filter((account) => matchesUser(account, query));

  return (
    <div className="flex flex-col gap-4">
      <StatTile label="Registered users" value={accounts.length.toLocaleString()} />
      {users.error && <LoadFailed load={users} label="The refreshed user list" />}

      <Field label="Search users">
        {(control) => (
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              {...control}
              type="search"
              className="pl-9"
              placeholder="Name or email"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        )}
      </Field>

      {accounts.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No users yet"
          description="People appear here once they have registered."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {TIERS.map((tier) => {
            const inTier = accounts.filter((account) => account.tier === tier);
            const visible = shown.filter((account) => account.tier === tier);
            return (
              <TierGroup key={tier} tier={tier} count={inTier.length}>
                {visible.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                    {inTier.length === 0
                      ? `No one is on ${TIER_LABEL[tier]}.`
                      : `No one on ${TIER_LABEL[tier]} matches that search.`}
                  </p>
                ) : (
                  <ul className="divide-y divide-divider">
                    {visible.map((account) => {
                      const score = scores[account.id];
                      const name = account.username ?? "Unnamed user";
                      return (
                        <li
                          key={account.id}
                          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <p className="break-words font-medium">{name}</p>
                            <p className="break-all text-sm text-muted-foreground">
                              {account.email ?? "No email address"}
                            </p>
                            <p className="text-xs tabular-nums text-muted-foreground">
                              {account.expiry_date &&
                                `Expires ${new Date(account.expiry_date).toLocaleDateString()}`}
                              {account.expiry_date && score && " · "}
                              {score &&
                                `Average ${score.average.toFixed(1)}% over ${score.tests} ${score.tests === 1 ? "test" : "tests"}`}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <AssignTierDialog
                              userId={account.id}
                              name={name}
                              onAssigned={() => void users.reload()}
                            />
                            {account.tier !== "novice" && (
                              <ConfirmDialog
                                title={`Take ${TIER_LABEL[account.tier]} away from ${name}?`}
                                description="They go back to Novice straight away and lose the higher daily and per-test limits."
                                confirmLabel="Revoke plan"
                                destructive
                                onConfirm={() => revoke(account)}
                                trigger={(open) => (
                                  <Button size="sm" variant="outline" onClick={open}>
                                    Revoke
                                  </Button>
                                )}
                              />
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </TierGroup>
            );
          })}
        </div>
      )}
    </div>
  );
}
