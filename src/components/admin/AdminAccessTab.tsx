import { Search, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { LoadFailed } from "@/components/app/LoadFailed";
import { Section } from "@/components/app/Section";
import { StatTile } from "@/components/app/StatTile";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerData } from "@/hooks/use-server-data";
import { supabase } from "@/integrations/supabase/client";

interface Candidate {
  id: string;
  username: string | null;
  email: string | null;
  isAdmin: boolean;
  isCentralAdmin: boolean;
}

const SEARCH_DELAY_MS = 180;
const MAX_RESULTS = 25;

/** How many people can open the Admin section: central admins and admins, each counted once. */
async function countAdmins(): Promise<number> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["admin", "central_admin"]);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => row.user_id)).size;
}

/** Registered users whose username contains the text, with the admin roles each one holds. */
async function findCandidates(term: string): Promise<Candidate[]> {
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, username, email")
    .ilike("username", `%${term}%`)
    .order("username", { ascending: true })
    .limit(MAX_RESULTS);
  if (error) throw new Error(error.message);

  const ids = (profiles ?? []).map((profile) => profile.id);
  const { data: roles, error: roleError } = ids.length
    ? await supabase.from("user_roles").select("user_id, role").in("user_id", ids)
    : { data: [], error: null };
  if (roleError) throw new Error(roleError.message);

  const held = new Map<string, Set<string>>();
  for (const { user_id, role } of roles ?? []) {
    held.set(user_id, (held.get(user_id) ?? new Set<string>()).add(role));
  }
  return (profiles ?? []).map((profile) => {
    const own = held.get(profile.id) ?? new Set<string>();
    return {
      ...profile,
      isAdmin: own.has("admin") || own.has("central_admin"),
      isCentralAdmin: own.has("central_admin"),
    };
  });
}

/** Give a registered user the admin role or take it away. The central admin's role cannot be changed here. */
export function AdminAccessTab() {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const admins = useServerData(countAdmins, []);
  const found = useServerData(() => findCandidates(term), [term], term !== "");

  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(search.trim()), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  const change = async (candidate: Candidate): Promise<boolean> => {
    const result = candidate.isAdmin
      ? await supabase.from("user_roles").delete().eq("user_id", candidate.id).eq("role", "admin")
      : await supabase.from("user_roles").insert({ user_id: candidate.id, role: "admin" });
    if (result.error) {
      toast.error(result.error.message);
      return false;
    }
    toast.success(candidate.isAdmin ? "Admin access revoked." : "Admin access granted.");
    await Promise.all([admins.reload(), found.reload()]);
    return true;
  };

  const name = (candidate: Candidate) => candidate.username || "Unnamed user";
  // The list belongs to the last term that was searched; it is stale while the next one loads.
  const searching =
    term !== search.trim() || found.loading || (found.data === null && found.error === null);

  return (
    <div className="flex flex-col gap-4">
      {admins.error && !admins.data ? (
        <LoadFailed load={admins} label="The admin count" />
      ) : (
        <StatTile
          label="People with admin access"
          value={admins.data ?? <Skeleton className="h-9 w-12" />}
          note="Central admins and admins who can open the Admin section."
        />
      )}

      <Section
        title="Assign admin"
        description="Search registered users by username to give or take away admin access."
      >
        <Field label="Username">
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
                placeholder="Start typing a username"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          )}
        </Field>

        <div aria-live="polite" className="flex flex-col gap-3">
          {search.trim() === "" ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Type a username to find a registered user.
            </p>
          ) : found.error && !searching ? (
            <Alert variant="destructive">
              <AlertDescription>Search failed. {found.error}</AlertDescription>
            </Alert>
          ) : searching ? (
            <div aria-busy="true">
              <span className="sr-only">Searching</span>
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (found.data ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No registered user has a username like that.
            </p>
          ) : (
            <ul className="divide-y divide-divider rounded-md border">
              {(found.data ?? []).map((candidate) => (
                <li
                  key={candidate.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="break-words font-medium">{name(candidate)}</p>
                    <p className="break-all text-sm text-muted-foreground">
                      {candidate.email || "No email address"}
                    </p>
                    {candidate.isAdmin && (
                      <Badge variant="secondary" className="mt-1">
                        {candidate.isCentralAdmin ? "Central admin" : "Admin"}
                      </Badge>
                    )}
                  </div>
                  {candidate.isCentralAdmin ? (
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <ShieldCheck aria-hidden="true" className="size-4" />
                      Cannot be changed here
                    </span>
                  ) : (
                    <ConfirmDialog
                      title={
                        candidate.isAdmin
                          ? `Revoke admin access from ${name(candidate)}?`
                          : `Make ${name(candidate)} an admin?`
                      }
                      description={
                        candidate.isAdmin
                          ? "They can no longer open the Admin section."
                          : "They will be able to add, edit and retire questions, handle reports and create shared tests."
                      }
                      confirmLabel={candidate.isAdmin ? "Revoke admin" : "Make admin"}
                      destructive={candidate.isAdmin}
                      onConfirm={() => change(candidate)}
                      trigger={(open) => (
                        <Button
                          size="sm"
                          variant={candidate.isAdmin ? "outline" : "default"}
                          onClick={open}
                        >
                          {candidate.isAdmin ? "Revoke admin" : "Make admin"}
                        </Button>
                      )}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>
    </div>
  );
}
