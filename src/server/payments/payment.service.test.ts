import { describe, expect, it, vi } from "vitest";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  LimitReachedError,
  ValidationError,
} from "../errors";
import { type PaymentProvider, type VerifiedPayment, PaymentService } from "./payment.service";

const USER = { id: "user-1", email: "Student@Example.com" };
const EXPIRY = "2026-11-10T00:00:00.000Z";

const payment = (overrides: Partial<VerifiedPayment> = {}): VerifiedPayment => ({
  status: "success",
  reference: "ref-12345",
  amountKobo: 150_000,
  currency: "NGN",
  customerEmail: "student@example.com",
  metadataUserId: "user-1",
  metadataPlan: "erudite",
  ...overrides,
});

function setup(
  verified: VerifiedPayment | null = payment(),
  overrides: { price?: number | null; activate?: () => Promise<string>; allowed?: boolean } = {},
) {
  const provider = {
    verify: vi.fn(async (_reference: string) => verified),
  } satisfies PaymentProvider;
  const plans = {
    activePrice: vi.fn(async (_plan: string) =>
      overrides.price === undefined ? 1500 : overrides.price,
    ),
  };
  const activator = { activate: vi.fn(overrides.activate ?? (async () => EXPIRY)) };
  const limiter = {
    consume: vi.fn(async (_bucket: string, _limit: number, _window: number) => ({
      allowed: overrides.allowed ?? true,
      retryAfterSeconds: 120,
    })),
  };
  return {
    service: new PaymentService({ provider, plans, activator, limiter }),
    provider,
    plans,
    activator,
    limiter,
  };
}
const run = (s: ReturnType<typeof setup>, reference = "ref-12345") =>
  s.service.verify(USER, reference);
const status = (error: unknown) => (error as AppError).statusCode;

describe("PaymentService.verify: the happy path", () => {
  it("activates the plan the payment was made for, at the stored price, and returns the expiry", async () => {
    const s = setup();
    expect(await run(s)).toEqual({ tier: "erudite", expiresAt: EXPIRY });
    expect(s.activator.activate).toHaveBeenCalledWith({
      userId: "user-1",
      tier: "erudite",
      reference: "ref-12345",
      amountNaira: 1500,
    });
  });

  it("accepts a different case of the email, and a scholar plan", async () => {
    const s = setup(payment({ customerEmail: "STUDENT@example.COM", metadataPlan: "scholar" }));
    expect((await run(s)).tier).toBe("scholar");
  });
});

describe("PaymentService.verify: refusals, none of which may activate anything", () => {
  it.each([
    ["the provider does not know the reference", null, 402],
    ["the payment did not succeed", payment({ status: "failed" }), 402],
    ["the provider answers for a different reference", payment({ reference: "other-ref" }), 402],
    ["the payment was made by another account", payment({ metadataUserId: "someone-else" }), 403],
    ["the payment has no account in its metadata", payment({ metadataUserId: undefined }), 403],
    ["the customer email is another's", payment({ customerEmail: "other@example.com" }), 403],
    ["the plan is not one that can be bought", payment({ metadataPlan: "novice" }), 400],
    ["the plan is missing", payment({ metadataPlan: undefined }), 400],
    ["the currency is not naira", payment({ currency: "USD" }), 400],
    ["the amount is less than the price", payment({ amountKobo: 100 }), 400],
    ["the amount is more than the price", payment({ amountKobo: 150_001 }), 400],
  ])("%s", async (_label, verified, expected) => {
    const s = setup(verified);
    const error = await run(s).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(status(error)).toBe(expected);
    expect(s.activator.activate).not.toHaveBeenCalled();
  });

  it("refuses when the plan has no active price", async () => {
    const s = setup(payment(), { price: null });
    await expect(run(s)).rejects.toBeInstanceOf(ValidationError);
    expect(s.activator.activate).not.toHaveBeenCalled();
  });

  it("compares in kobo without floating-point drift", async () => {
    const s = setup(payment({ amountKobo: 199_999 }), { price: 1999.99 });
    expect((await run(s)).tier).toBe("erudite");
  });
});

describe("PaymentService.verify: replay and failure", () => {
  it("lets the database's refusal of a reused reference through as a conflict", async () => {
    const s = setup(payment(), {
      activate: async () => {
        throw new ConflictError("This payment reference has already been used.");
      },
    });
    await expect(run(s)).rejects.toBeInstanceOf(ConflictError);
  });

  it("does not catch a database failure: it reaches the guard unchanged, to be logged and answered generically", async () => {
    const boom = new Error("connection reset (db password=hunter2)");
    const s = setup(payment(), {
      activate: async () => {
        throw boom;
      },
    });
    await expect(run(s)).rejects.toBe(boom);
  });

  it("asks the provider only for the reference it was given, once", async () => {
    const s = setup(payment({ reference: "ref-99999" }));
    await run(s, "ref-99999");
    expect(s.provider.verify).toHaveBeenCalledTimes(1);
    expect(s.provider.verify).toHaveBeenCalledWith("ref-99999");
  });

  it("never throws a plain forbidden for the wrong account with the other account's id in the message", async () => {
    const error = await run(setup(payment({ metadataUserId: "victim-id-777" }))).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ForbiddenError);
    expect((error as Error).message).not.toContain("victim-id-777");
  });
});

describe("PaymentService.verify: abuse limit", () => {
  it("counts each attempt against the account, before the provider is asked", async () => {
    const s = setup();
    await run(s);
    expect(s.limiter.consume).toHaveBeenCalledWith("payment-verify:user-1", 10, 3600);
  });

  it("refuses with a 429 when the account has asked too often, without calling the provider", async () => {
    const s = setup(payment(), { allowed: false });
    await expect(run(s)).rejects.toBeInstanceOf(LimitReachedError);
    expect(s.provider.verify).not.toHaveBeenCalled();
  });
});
