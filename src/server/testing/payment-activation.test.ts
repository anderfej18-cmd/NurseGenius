import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serviceCall } from "./fixtures";
import { createTestDb, type TestDb } from "./pglite-db";

// The database half of a payment: `activate_verified_subscription` runs the real migrations on PGlite.
// The Worker only calls it after Paystack has confirmed the payment; these tests prove what the database
// does with that call, including a repeated callback and a reference that belongs to someone else.

let db: TestDb;
let alice: string;
let bob: string;

const activate = (user: string, tier: string, reference: string, amount: number) =>
  serviceCall<{ expiry: string }>(
    db,
    `SELECT public.activate_verified_subscription($1, $2::public.user_tier, $3, $4) AS expiry`,
    [user, tier, reference, amount],
  ).then((rows) => rows[0].expiry);

const profileOf = async (user: string) =>
  (
    await db.admin<{ tier: string; expiry_date: string | null }>(
      `SELECT tier::text, expiry_date FROM public.profiles WHERE id = $1`,
      [user],
    )
  )[0];

const paymentsFor = (user: string) =>
  db.admin<{ plan_name: string; amount_ngn: string; reference: string }>(
    `SELECT plan_name, amount_ngn::text, reference FROM public.subscription_payments WHERE user_id = $1`,
    [user],
  );

beforeAll(async () => {
  db = await createTestDb();
  [alice, bob] = await Promise.all(
    ["alice", "bob"].map((name) => db.createUser(`${name}-pay@example.com`)),
  );
});
afterAll(() => db.pg.close());

describe("activate_verified_subscription", () => {
  it("starts the plan at the stored price and records one payment", async () => {
    const [{ price_ngn, duration_days }] = await db.admin<{
      price_ngn: string;
      duration_days: number;
    }>(`SELECT price_ngn::text, duration_days FROM public.plans WHERE name = 'erudite'`);
    const expiry = await activate(alice, "erudite", "ref-success-1", Number(price_ngn));

    const profile = await profileOf(alice);
    expect(profile.tier).toBe("erudite");
    expect(new Date(profile.expiry_date as string).getTime()).toBe(new Date(expiry).getTime());
    const days = (new Date(expiry).getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(duration_days);
    expect(await paymentsFor(alice)).toHaveLength(1);
  });

  it("treats a repeated callback for the same payment as harmless: same expiry, one row", async () => {
    const [{ price_ngn }] = await db.admin<{ price_ngn: string }>(
      `SELECT price_ngn::text FROM public.plans WHERE name = 'scholar'`,
    );
    const first = await activate(bob, "scholar", "ref-duplicate-1", Number(price_ngn));
    const second = await activate(bob, "scholar", "ref-duplicate-1", Number(price_ngn));
    expect(new Date(second).getTime()).toBe(new Date(first).getTime());
    expect(await paymentsFor(bob)).toHaveLength(1);
  });

  it("refuses a reference already used by another account, plan or amount, and changes nothing", async () => {
    const [{ price_ngn }] = await db.admin<{ price_ngn: string }>(
      `SELECT price_ngn::text FROM public.plans WHERE name = 'erudite'`,
    );
    await expect(activate(bob, "erudite", "ref-success-1", Number(price_ngn))).rejects.toThrow(
      /already used/,
    );
    await expect(activate(alice, "scholar", "ref-success-1", Number(price_ngn))).rejects.toThrow(
      /already used/,
    );
    expect((await profileOf(bob)).tier).toBe("scholar");
    expect(await paymentsFor(alice)).toHaveLength(1);
  });

  it("refuses an amount that is not the active price, a free tier, and a short reference", async () => {
    const carol = await db.createUser("carol-pay@example.com");
    await expect(activate(carol, "erudite", "ref-wrong-amount", 1)).rejects.toThrow(
      /does not match/,
    );
    await expect(activate(carol, "novice", "ref-novice-1", 1500)).rejects.toThrow(/invalid tier/);
    await expect(activate(carol, "erudite", "abc", 1500)).rejects.toThrow(
      /invalid payment reference/,
    );
    expect((await profileOf(carol)).tier).toBe("novice");
    expect(await paymentsFor(carol)).toHaveLength(0);
  });

  it("is closed to signed-in browsers and visitors; only the server role may call it", async () => {
    for (const role of ["authenticated", "anon"] as const) {
      await expect(
        db.as(
          role,
          alice,
          `SELECT public.activate_verified_subscription($1, 'erudite', 'ref-browser-1', 1500)`,
          [alice],
        ),
      ).rejects.toThrow(/permission denied/);
    }
  });
});
