import { createFileRoute } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { Section } from "@/components/app/Section";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { loadPaystack, PAYSTACK_PUBLIC_KEY } from "@/lib/paystack";
import { planPerks } from "@/lib/plan-view";
import { TIER_LABEL } from "@/lib/exam-rules";

export const Route = createFileRoute("/_app/payments")({
  component: Payments,
  head: () => ({
    meta: [
      { title: "Upgrade your plan | NurseGenius" },
      {
        name: "description",
        content:
          "Upgrade to Erudite or Scholar with secure Paystack checkout and unlock more daily RN & RM practice questions.",
      },
      { property: "og:title", content: "Upgrade your plan | NurseGenius" },
      {
        property: "og:description",
        content: "Secure Paystack checkout for Erudite and Scholar access on NurseGenius.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

interface Plan {
  id: string;
  name: string;
  price_ngn: number;
  duration_days: number;
  is_active: boolean;
}

interface PaymentRow {
  id: string;
  plan_name: string;
  amount_ngn: number;
  duration_days: number;
  created_at: string;
}

const date = (value: string | Date) =>
  new Date(value).toLocaleDateString("en-GB", { dateStyle: "medium" });

function Payments() {
  const { user, profile, refresh } = useAuth();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [plansFailed, setPlansFailed] = useState(false);
  const [history, setHistory] = useState<PaymentRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const loadHistory = async (uid: string) => {
    const { data } = await supabase
      .from("subscription_payments")
      .select("id, plan_name, amount_ngn, duration_days, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    setHistory((data as PaymentRow[]) ?? []);
  };

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("id, name, price_ngn, duration_days, is_active")
        .eq("is_active", true)
        .order("price_ngn");
      setPlansFailed(error !== null);
      setPlans((data as Plan[]) ?? []);
      if (user) await loadHistory(user.id);
    })();
  }, [user]);

  const pay = async (plan: Plan) => {
    if (!user?.email) return toast.error("Your account has no email on file.");
    const key = PAYSTACK_PUBLIC_KEY();
    if (!key) return toast.error("Payments are not configured yet.");
    setBusy(plan.id);
    try {
      const paystack = await loadPaystack();
      const handler = paystack.setup({
        key,
        email: user.email,
        amount: Math.round(Number(plan.price_ngn) * 100), // kobo
        currency: "NGN",
        metadata: { user_id: user.id, plan: plan.name, duration_days: plan.duration_days },
        callback: (res) => {
          // Paystack runs this outside React's async flow.
          void (async () => {
            try {
              const { data: sessionData } = await supabase.auth.getSession();
              const accessToken = sessionData.session?.access_token;
              if (!accessToken)
                throw new Error("Payment received. Sign in again to activate your plan.");
              const response = await fetch("/api/public/paystack-verify", {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ reference: res.reference }),
              });
              const result = (await response.json()) as {
                ok?: boolean;
                tier?: string;
                expiresAt?: string;
                error?: string;
              };
              if (!response.ok || !result.ok)
                throw new Error(result.error ?? "Payment received but plan activation failed.");
              const until = result.expiresAt ? date(result.expiresAt) : "";
              toast.success(`You're now ${plan.name}! Access until ${until}`);
              await refresh();
              await loadHistory(user.id);
            } catch (error) {
              toast.error(
                error instanceof Error
                  ? `Payment received but activation failed: ${error.message}`
                  : "Payment received but activation failed. Please contact support.",
              );
            } finally {
              setBusy(null);
            }
          })();
        },
        onClose: () => {
          setBusy(null);
        },
      });
      handler.openIframe();
    } catch (e) {
      setBusy(null);
      toast.error(e instanceof Error ? e.message : "Could not start checkout");
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        title="Upgrade your plan"
        description="Secure card payment through Paystack. Your access is activated as soon as the payment is verified."
      />

      <div className="flex flex-col gap-6">
        {profile && profile.tier !== "novice" && (
          <Alert variant="success">
            <p className="font-medium">
              You are on the {TIER_LABEL[profile.tier]} plan
              {profile.expiry_date ? `, until ${date(profile.expiry_date)}` : ""}.
            </p>
            <AlertDescription>
              Paying again adds the new plan's days to your access.
            </AlertDescription>
          </Alert>
        )}

        {!plans && (
          <div aria-busy="true" className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Skeleton className="h-52 w-full" />
            <Skeleton className="h-52 w-full" />
          </div>
        )}

        {plans && plansFailed && (
          <Alert variant="destructive">
            <AlertDescription>
              The plans could not be loaded. Refresh the page to try again.
            </AlertDescription>
          </Alert>
        )}

        {plans && !plansFailed && plans.length === 0 && (
          <EmptyState
            icon={CreditCard}
            title="No plans are available right now"
            description="Please check back shortly."
          />
        )}

        {plans && plans.length > 0 && (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {plans.map((p) => (
              <li key={p.id}>
                <Card className="flex h-full flex-col gap-4 p-6">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{p.name}</p>
                    <p className="mt-1 font-sans text-3xl font-semibold">
                      ₦{Number(p.price_ngn).toLocaleString()}
                      <span className="text-base font-normal text-muted-foreground">
                        {" "}
                        / {p.duration_days} days
                      </span>
                    </p>
                  </div>
                  <p className="flex-1 text-sm text-muted-foreground">
                    {planPerks(p.name, p.duration_days)}
                  </p>
                  <Button
                    className="w-full"
                    size="lg"
                    loading={busy === p.id}
                    onClick={() => pay(p)}
                  >
                    {busy === p.id ? "Opening Paystack" : "Pay with Paystack"}
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        )}

        {history.length > 0 && (
          <Section title="Your payments">
            <ul className="divide-y divide-divider">
              {history.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium capitalize">
                      {h.plan_name}, ₦{Number(h.amount_ngn).toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {h.duration_days} days · {date(h.created_at)}
                    </p>
                  </div>
                  <Badge variant="success">Paid</Badge>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Need help?">
          <p className="text-sm text-muted-foreground">
            Telegram:{" "}
            <a
              href="https://t.me/nursegenius"
              className="rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-ring"
            >
              @nursegenius
            </a>
            . Email:{" "}
            <a
              href="mailto:nursegenius3@gmail.com"
              className="rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-ring"
            >
              nursegenius3@gmail.com
            </a>
            .
          </p>
        </Section>
      </div>
    </div>
  );
}
