import { z } from "zod";
import { AppError } from "../errors";
import type { PaymentProvider, VerifiedPayment } from "./payment.service";

const VERIFY_URL = "https://api.paystack.co/transaction/verify/";
const UNREACHABLE = "Could not verify the payment with the payment provider.";

const bodySchema = z.object({
  status: z.boolean().optional(),
  data: z
    .object({
      status: z.string().optional(),
      reference: z.string().optional(),
      amount: z.number().optional(),
      currency: z.string().optional(),
      customer: z.object({ email: z.string().optional() }).optional(),
      metadata: z.object({ user_id: z.string().optional(), plan: z.string().optional() }).nullish(),
    })
    .optional(),
});

/** The Paystack adapter: the only code that knows its URL, its authentication and its field names. */
export class PaystackProvider implements PaymentProvider {
  constructor(
    private readonly options: {
      secretKey: string;
      timeoutMs: number;
      fetcher?: (url: string, init: RequestInit) => Promise<Response>;
    },
  ) {}

  async verify(reference: string): Promise<VerifiedPayment | null> {
    const fetcher = this.options.fetcher ?? fetch;
    let response: Response;
    try {
      response = await fetcher(`${VERIFY_URL}${encodeURIComponent(reference)}`, {
        headers: { Authorization: `Bearer ${this.options.secretKey}`, Accept: "application/json" },
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch {
      throw new AppError(UNREACHABLE, "INTERNAL", 502);
    }
    // Paystack answers 400/404 for a reference it does not know; anything else non-2xx is an outage.
    if (response.status === 404 || response.status === 400) return null;
    if (!response.ok) throw new AppError(UNREACHABLE, "INTERNAL", 502);

    let parsed: z.SafeParseReturnType<unknown, z.infer<typeof bodySchema>>;
    try {
      parsed = bodySchema.safeParse(await response.json());
    } catch {
      throw new AppError(UNREACHABLE, "INTERNAL", 502);
    }
    if (!parsed.success) throw new AppError(UNREACHABLE, "INTERNAL", 502);
    const { status, data } = parsed.data;
    if (status !== true || data === undefined) return null;
    return {
      status: data.status ?? "",
      reference: data.reference ?? "",
      amountKobo: data.amount ?? 0,
      currency: data.currency ?? "",
      customerEmail: data.customer?.email,
      metadataUserId: data.metadata?.user_id,
      metadataPlan: data.metadata?.plan,
    };
  }
}
