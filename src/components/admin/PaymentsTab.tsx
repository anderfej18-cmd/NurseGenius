import { RefreshCw, Wallet } from "lucide-react";
import { LoadFailed } from "@/components/app/LoadFailed";
import { StatTile } from "@/components/app/StatTile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useServerData } from "@/hooks/use-server-data";
import { supabase } from "@/integrations/supabase/client";
import { formatNaira, summarizePayments } from "@/lib/admin-view";

interface Payer {
  username: string | null;
  email: string | null;
  tier: string;
  expiry_date: string | null;
}

interface Payment {
  id: string;
  user_id: string;
  plan_name: string;
  amount_ngn: number;
  duration_days: number;
  created_at: string;
  reference: string | null;
  profile: Payer | null;
}

/** Every plan payment, newest first, each with the payer's current tier. Admins may read these tables. */
async function loadPayments(): Promise<Payment[]> {
  const { data, error } = await supabase
    .from("subscription_payments")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const payments = data ?? [];
  const userIds = Array.from(new Set(payments.map((payment) => payment.user_id)));
  const payers = new Map<string, Payer>();
  if (userIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, username, email, tier, expiry_date")
      .in("id", userIds);
    if (profileError) throw new Error(profileError.message);
    for (const profile of profiles ?? []) payers.set(profile.id, profile);
  }
  return payments.map((payment) => ({
    ...payment,
    profile: payers.get(payment.user_id) ?? null,
  }));
}

/** The money side: how many students paid, for which plan, and the total collected. */
export function PaymentsTab() {
  const payments = useServerData(loadPayments, []);
  const rows = payments.data ?? [];
  const summary = summarizePayments(rows);

  return (
    <div className="flex flex-col gap-6">
      {payments.error && <LoadFailed load={payments} label="Upgrades" />}
      {payments.loading && !payments.data && (
        <div aria-busy="true" className="flex flex-col gap-3">
          <span className="sr-only">Loading upgrades</span>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}
      {payments.data && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Students upgraded" value={summary.students} />
            <StatTile label="Erudite purchases" value={summary.purchases["erudite"] ?? 0} />
            <StatTile label="Scholar purchases" value={summary.purchases["scholar"] ?? 0} />
            <StatTile label="Total collected" value={formatNaira(summary.collected)} />
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No upgrades yet"
              description="A payment appears here once a student pays for a plan."
            />
          ) : (
            <Card>
              <div className="flex items-center justify-between gap-3 px-4 pt-4">
                <h2 className="font-sans text-lg font-semibold tracking-normal">Payments</h2>
                <Button
                  size="sm"
                  variant="outline"
                  loading={payments.loading}
                  onClick={() => void payments.reload()}
                >
                  <RefreshCw /> Refresh
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Now</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="max-w-64">
                        <p className="truncate font-medium">
                          {payment.profile?.username ?? "Unnamed"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {payment.profile?.email ?? payment.user_id.slice(0, 8)}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="success" className="capitalize">
                          {payment.plan_name}
                        </Badge>
                        <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                          {payment.duration_days} days
                        </p>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatNaira(payment.amount_ngn)}
                      </TableCell>
                      <TableCell>
                        <p className="whitespace-nowrap tabular-nums">
                          {new Date(payment.created_at).toLocaleString()}
                        </p>
                        {payment.reference && (
                          <p className="break-all text-xs text-muted-foreground">
                            Ref {payment.reference}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {payment.profile?.tier ?? "Unknown"}
                        </Badge>
                        {payment.profile?.expiry_date && (
                          <p className="mt-1 whitespace-nowrap text-xs text-muted-foreground">
                            Expires {new Date(payment.profile.expiry_date).toLocaleDateString()}
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
