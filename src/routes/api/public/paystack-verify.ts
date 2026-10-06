import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

const payloadSchema = z.object({ reference: z.string().trim().min(4).max(200) });

export const Route = createFileRoute("/api/public/paystack-verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authorization = request.headers.get("authorization") ?? "";
          if (!authorization.startsWith("Bearer ")) return Response.json({ error: "Sign in to verify this payment." }, { status: 401 });
          const token = authorization.slice("Bearer ".length).trim();
          const url = process.env["SUPABASE_URL"];
          const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
          const paystackSecret = process.env["PAYSTACK_SECRET_KEY"];
          if (!url || !publishableKey || !paystackSecret) return Response.json({ error: "Payment verification is not configured." }, { status: 503 });

          const supabase = createClient<Database>(url, publishableKey, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
          });
          const { data: userData, error: authError } = await supabase.auth.getUser(token);
          if (authError || !userData.user) return Response.json({ error: "Sign in to verify this payment." }, { status: 401 });

          let body: unknown;
          try { body = await request.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
          const parsed = payloadSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: "A valid payment reference is required." }, { status: 400 });

          const verificationResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(parsed.data.reference)}`, {
            headers: { Authorization: `Bearer ${paystackSecret}`, Accept: "application/json" },
          });
          if (!verificationResponse.ok) return Response.json({ error: "Could not verify the payment with the payment provider." }, { status: 502 });
          const verified = await verificationResponse.json() as {
            status?: boolean;
            data?: { status?: string; reference?: string; amount?: number; currency?: string; customer?: { email?: string }; metadata?: { user_id?: string; plan?: string } };
          };
          const payment = verified.data;
          if (!verified.status || !payment || payment.status !== "success" || payment.reference !== parsed.data.reference) {
            return Response.json({ error: "Payment was not confirmed as successful." }, { status: 402 });
          }
          if (payment.metadata?.user_id !== userData.user.id || payment.customer?.email?.toLowerCase() !== userData.user.email?.toLowerCase()) {
            return Response.json({ error: "This payment does not match the signed-in account." }, { status: 403 });
          }
          if (payment.metadata?.plan !== "erudite" && payment.metadata?.plan !== "scholar") {
            return Response.json({ error: "The payment does not match a supported plan." }, { status: 400 });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: plans, error: planError } = await supabaseAdmin.from("plans")
            .select("price_ngn").eq("name", payment.metadata.plan).eq("is_active", true).limit(1);
          if (planError) return Response.json({ error: "Could not validate the selected plan." }, { status: 500 });
          const plan = plans?.[0];
          if (!plan || payment.currency !== "NGN" || payment.amount !== Math.round(Number(plan.price_ngn) * 100)) {
            return Response.json({ error: "The paid amount does not match the selected plan." }, { status: 400 });
          }

          const { data: expiry, error: activationError } = await supabaseAdmin.rpc("activate_verified_subscription", {
            _user_id: userData.user.id,
            _tier: payment.metadata.plan,
            _reference: parsed.data.reference,
            _amount: Number(plan.price_ngn),
          });
          if (activationError) return Response.json({ error: activationError.message }, { status: 400 });
          return Response.json({ ok: true, tier: payment.metadata.plan, expiresAt: expiry });
        } catch {
          return Response.json({ error: "Payment verification failed. Please try again." }, { status: 500 });
        }
      },
    },
  },
});