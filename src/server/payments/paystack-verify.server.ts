import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { AppError, guard, toAppError } from "../errors";
import { getConfig } from "../config.server";
import { SupabaseRateLimiter } from "../rate-limit/rate-limiter.repository.server";
import { PaymentService } from "./payment.service";
import { SupabasePaymentStore } from "./payment.repository.server";
import { PaystackProvider } from "./paystack.provider.server";

const PROVIDER_TIMEOUT_MS = 15_000;
const payloadSchema = z.object({ reference: z.string().trim().min(4).max(200) }).strict();

export interface PaymentVerificationDeps {
  /** The signed-in account behind a bearer token, or null. */
  authenticate(token: string): Promise<{ id: string; email: string | undefined } | null>;
  verify(
    account: { id: string; email: string | undefined },
    reference: string,
  ): Promise<{ tier: string; expiresAt: string }>;
}

/**
 * The HTTP edge of payment verification: authenticate, validate, delegate, and turn the outcome into
 * a response. No rule lives here, and no error text other than a typed one's own message leaves it.
 */
export async function handlePaymentVerification(
  request: Request,
  deps: PaymentVerificationDeps,
): Promise<Response> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const account = token === "" ? null : await deps.authenticate(token).catch(() => null);
  if (account === null) return failure(401, "Sign in to verify this payment.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure(400, "Invalid request.");
  }
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) return failure(400, "A valid payment reference is required.");

  try {
    const result = await deps.verify(account, parsed.data.reference);
    return Response.json({ ok: true, tier: result.tier, expiresAt: result.expiresAt });
  } catch (error) {
    const typed: AppError = toAppError(error);
    return failure(typed.statusCode, typed.message);
  }
}

const failure = (status: number, error: string) => Response.json({ error }, { status });

/** Route entry (the route file path is fixed by the router). Loaded by a dynamic import, never in the client bundle. */
export async function verifyPaystackPayment(request: Request): Promise<Response> {
  return handlePaymentVerification(request, await defaultDeps());
}

async function defaultDeps(): Promise<PaymentVerificationDeps> {
  const config = getConfig();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const store = new SupabasePaymentStore(supabaseAdmin);
  const service = new PaymentService({
    limiter: new SupabaseRateLimiter(supabaseAdmin),
    provider: new PaystackProvider({
      secretKey: config.paystack.secretKey,
      timeoutMs: PROVIDER_TIMEOUT_MS,
    }),
    plans: store,
    activator: store,
  });
  const anonymous = createClient<Database>(config.supabase.url, config.supabase.publishableKey, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  return {
    async authenticate(token) {
      const { data, error } = await anonymous.auth.getUser(token);
      return error || !data.user ? null : { id: data.user.id, email: data.user.email };
    },
    verify: (account, reference) => guard(() => service.verify(account, reference)),
  };
}
