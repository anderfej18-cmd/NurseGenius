import { ForbiddenError, PaymentError, ValidationError } from "../errors";
import { type RateLimiter, enforceLimits } from "../rate-limit/rate-limit";

const VERIFY_LIMIT = { limit: 10, windowSeconds: 3600 } as const;

/** The plans that can be bought. Anything else in a payment's metadata is refused. */
const BUYABLE_PLANS = ["erudite", "scholar"] as const;
export type BuyablePlan = (typeof BUYABLE_PLANS)[number];

/** What the provider says about a transaction, in our own terms (an anti-corruption layer). */
export interface VerifiedPayment {
  readonly status: string;
  readonly reference: string;
  readonly amountKobo: number;
  readonly currency: string;
  readonly customerEmail: string | undefined;
  readonly metadataUserId: string | undefined;
  readonly metadataPlan: string | undefined;
}

/** Null when the provider does not know the transaction or reports it unsuccessful. Throws a 502 when it cannot be asked. */
export interface PaymentProvider {
  verify(reference: string): Promise<VerifiedPayment | null>;
}

interface Dependencies {
  readonly limiter: RateLimiter;
  readonly provider: PaymentProvider;
  readonly plans: { activePrice(plan: BuyablePlan): Promise<number | null> };
  readonly activator: {
    /** One transaction in the database; repeating a reference for the same payment changes nothing. */
    activate(input: {
      userId: string;
      tier: BuyablePlan;
      reference: string;
      amountNaira: number;
    }): Promise<string>;
  };
}

/**
 * Turns a provider-confirmed payment into a subscription, once. Every check that decides whether
 * money was really paid by this student for this plan is here; the database enforces the replay rule.
 */
export class PaymentService {
  constructor(private readonly deps: Dependencies) {}

  async verify(
    account: { id: string; email: string | undefined },
    reference: string,
  ): Promise<{ tier: BuyablePlan; expiresAt: string }> {
    await enforceLimits(this.deps.limiter, [
      { bucket: `payment-verify:${account.id}`, ...VERIFY_LIMIT },
    ]);
    const payment = await this.deps.provider.verify(reference);
    if (payment === null || payment.status !== "success" || payment.reference !== reference) {
      throw new PaymentError("Payment was not confirmed as successful.");
    }
    if (
      payment.metadataUserId !== account.id ||
      payment.customerEmail?.toLowerCase() !== account.email?.toLowerCase()
    ) {
      throw new ForbiddenError("This payment does not match the signed-in account.");
    }
    const tier = BUYABLE_PLANS.find((plan) => plan === payment.metadataPlan);
    if (tier === undefined)
      throw new ValidationError("The payment does not match a supported plan.");

    const price = await this.deps.plans.activePrice(tier);
    if (
      price === null ||
      payment.currency !== "NGN" ||
      payment.amountKobo !== Math.round(price * 100)
    ) {
      throw new ValidationError("The paid amount does not match the selected plan.");
    }
    const expiresAt = await this.deps.activator.activate({
      userId: account.id,
      tier,
      reference,
      amountNaira: price,
    });
    return { tier, expiresAt };
  }
}
