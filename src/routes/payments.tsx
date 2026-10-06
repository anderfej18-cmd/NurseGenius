import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { loadPaystack, PAYSTACK_PUBLIC_KEY } from "@/lib/paystack";

export const Route = createFileRoute("/payments")({
  component: Payments,
  head: () => ({
    meta: [
      { title: "Upgrade Your Plan — NurseGenius" },
      { name: "description", content: "Upgrade to Erudite or Scholar with secure Paystack checkout and unlock more daily RN & RM practice questions." },
      { property: "og:title", content: "Upgrade Your Plan — NurseGenius" },
      { property: "og:description", content: "Secure Paystack checkout for Erudite and Scholar access on NurseGenius." },
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
  id: string; plan_name: string; amount_ngn: number; duration_days: number; created_at: string;
}

const PERKS: Record<string, string> = {
  erudite: "500 questions/day • 150 per session • Full AI explanations",
  scholar: "Unlimited daily questions • 250 per session • Full AI explanations",
};

function Payments() {
  const { user, profile, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [history, setHistory] = useState<PaymentRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  const loadHistory = async (uid: string) => {
    const { data } = await supabase.from("subscription_payments")
      .select("id, plan_name, amount_ngn, duration_days, created_at")
      .eq("user_id", uid).order("created_at", { ascending: false });
    setHistory((data as PaymentRow[]) ?? []);
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("plans")
        .select("id, name, price_ngn, duration_days, is_active")
        .eq("is_active", true).order("price_ngn");
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
              if (!accessToken) throw new Error("Payment received. Sign in again to activate your plan.");
              const response = await fetch("/api/public/paystack-verify", {
                method: "POST",
                headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({ reference: res.reference }),
              });
              const result = await response.json() as { ok?: boolean; tier?: string; expiresAt?: string; error?: string };
              if (!response.ok || !result.ok) throw new Error(result.error ?? "Payment received but plan activation failed.");
              const until = result.expiresAt ? new Date(result.expiresAt).toLocaleDateString() : "";
              toast.success(`You're now ${plan.name}! Access until ${until}`);
              await refresh();
              await loadHistory(user.id);
            } catch (error) {
              toast.error(error instanceof Error ? `Payment received but activation failed: ${error.message}` : "Payment received but activation failed. Please contact support.");
            } finally {
              setBusy(null);
            }
          })();
        },
        onClose: () => { setBusy(null); },
      });
      handler.openIframe();
    } catch (e) {
      setBusy(null);
      toast.error(e instanceof Error ? e.message : "Could not start checkout");
    }
  };

  if (!plans) return <><AppHeader /><div className="p-12 text-center">Loading…</div></>;

  return (
    <>
      <AppHeader />
      <main className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold">Upgrade Your Plan</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Secure card payment via Paystack — access is activated instantly.
          </p>
        </header>

        {profile && profile.tier !== "novice" && (
          <Card className="p-5 bg-hero text-primary-foreground shadow-glow">
            <p className="text-xs uppercase opacity-80">Current plan</p>
            <p className="text-2xl font-bold capitalize">{profile.tier}</p>
            {profile.expiry_date && (
              <p className="text-sm opacity-90">Expires {new Date(profile.expiry_date).toLocaleDateString()}</p>
            )}
          </Card>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          {plans.map(p => (
            <Card key={p.id} className="p-6 flex flex-col gap-3">
              <div>
                <p className="text-xs uppercase text-muted-foreground tracking-wide">{p.name}</p>
                <p className="text-3xl font-bold mt-1">
                  ₦{Number(p.price_ngn).toLocaleString()}
                  <span className="text-base font-normal text-muted-foreground"> / {p.duration_days} days</span>
                </p>
              </div>
              <p className="text-sm text-muted-foreground flex-1">{PERKS[p.name] ?? `${p.duration_days} days of full access`}</p>
              <Button className="bg-hero w-full" disabled={busy === p.id} onClick={() => pay(p)}>
                {busy === p.id ? "Opening Paystack…" : "Pay with Paystack"}
              </Button>
            </Card>
          ))}
          {plans.length === 0 && (
            <Card className="p-6 text-sm text-muted-foreground md:col-span-2">
              No plans are available right now. Please check back shortly.
            </Card>
          )}
        </div>

        {history.length > 0 && (
          <Card className="p-5">
            <h2 className="font-semibold mb-3">Your Payments</h2>
            <div className="divide-y">
              {history.map(h => (
                <div key={h.id} className="flex justify-between items-center py-2 text-sm">
                  <div>
                    <p className="font-medium capitalize">{h.plan_name} — ₦{Number(h.amount_ngn).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">
                      {h.duration_days} days · {new Date(h.created_at).toLocaleString()}
                    </p>
                  </div>
                  <Badge className="bg-success text-success-foreground">paid</Badge>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card className="p-5 text-sm">
          <p className="font-semibold mb-1">Need help?</p>
          <p className="text-muted-foreground">
            Telegram: <a href="https://t.me/nursegenius" className="text-primary underline">@nursegenius</a> ·
            Email: <a href="mailto:nursegenius3@gmail.com" className="text-primary underline">nursegenius3@gmail.com</a>
          </p>
        </Card>
      </main>
    </>
  );
}
