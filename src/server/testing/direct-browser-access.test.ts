import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./pglite-db";

// The few screens that still read or write tables directly from the browser (see
// src/lib/browser-data-access.test.ts for the list). Each relies on the database alone to keep one
// person out of another's data, so this replays every migration and tries to break that.

let db: TestDb;
let central: string;
let subAdmin: string;
let alice: string;
let bob: string;

const grant = (user: string, role: "admin" | "central_admin") =>
  db.admin(`INSERT INTO public.user_roles (user_id, role) VALUES ($1, $2)`, [user, role]);
const asUser = (user: string, sql: string, params?: unknown[]) =>
  db.as("authenticated", user, sql, params);
const profileOf = async (user: string) =>
  (
    await db.admin<{ tier: string; first_name: string | null; questions_today: number }>(
      `SELECT tier, first_name, questions_today FROM public.profiles WHERE id = $1`,
      [user],
    )
  )[0];

beforeAll(async () => {
  db = await createTestDb();
  [central, subAdmin, alice, bob] = await Promise.all(
    ["central", "sub", "alice", "bob"].map((n) => db.createUser(`${n}-da@example.com`)),
  );
  await grant(central, "central_admin");
  await grant(subAdmin, "admin");
  await db.admin(
    `INSERT INTO public.subscription_payments (user_id, plan_name, amount_ngn, duration_days, reference)
     VALUES ($1, 'erudite', 1500, 30, 'ref-alice'), ($2, 'scholar', 2000, 30, 'ref-bob')`,
    [alice, bob],
  );
});
afterAll(() => db.pg.close());

const rolesOf = async (user: string) =>
  (
    await db.admin<{ role: string }>(`SELECT role FROM public.user_roles WHERE user_id = $1`, [
      user,
    ])
  )
    .map((row) => row.role)
    .sort();
const priceOf = async (plan: string) =>
  Number(
    (
      await db.admin<{ price_ngn: string }>(`SELECT price_ngn FROM public.plans WHERE name = $1`, [
        plan,
      ])
    )[0].price_ngn,
  );

describe("roles (Assign Admin tab)", () => {
  it("lets a student read only their own roles", async () => {
    const own = await asUser(alice, `SELECT user_id FROM public.user_roles`);
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((row) => (row as { user_id: string }).user_id === alice)).toBe(true);
    const seen = await asUser(subAdmin, `SELECT user_id FROM public.user_roles`);
    expect(seen.every((row) => (row as { user_id: string }).user_id === subAdmin)).toBe(true);
  });

  it("refuses a student, and an ordinary admin, who try to give a role", async () => {
    await expect(
      asUser(alice, `INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'admin')`, [alice]),
    ).rejects.toThrow(/row-level security|permission denied/i);
    await expect(
      asUser(
        subAdmin,
        `INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'central_admin')`,
        [subAdmin],
      ),
    ).rejects.toThrow(/row-level security|permission denied/i);
    expect(await rolesOf(alice)).not.toContain("admin");
    expect(await rolesOf(subAdmin)).not.toContain("central_admin");
  });

  it("refuses an ordinary admin who tries to take a role away", async () => {
    await asUser(subAdmin, `DELETE FROM public.user_roles WHERE user_id = $1`, [central]);
    expect(await rolesOf(central)).toContain("central_admin");
  });

  it("lets the central admin give and take away admin access", async () => {
    await asUser(central, `INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'admin')`, [
      bob,
    ]);
    expect(await rolesOf(bob)).toContain("admin");
    await asUser(central, `DELETE FROM public.user_roles WHERE user_id = $1 AND role = 'admin'`, [
      bob,
    ]);
    expect(await rolesOf(bob)).not.toContain("admin");
  });
});

describe("plans and payments (Upgrade page, Pricing and Upgrades tabs)", () => {
  it("lets a student read the plans but not change them", async () => {
    const plans = await asUser(alice, `SELECT name FROM public.plans`);
    expect(plans.length).toBeGreaterThan(0);
    const before = await priceOf("erudite");
    await asUser(alice, `UPDATE public.plans SET price_ngn = 1 WHERE name = 'erudite'`).catch(
      () => undefined,
    );
    expect(await priceOf("erudite")).toBe(before);
  });

  it("does not let an ordinary admin change a price either", async () => {
    const before = await priceOf("erudite");
    await asUser(subAdmin, `UPDATE public.plans SET price_ngn = 1 WHERE name = 'erudite'`).catch(
      () => undefined,
    );
    expect(await priceOf("erudite")).toBe(before);
  });

  it("lets the central admin change a price", async () => {
    await asUser(central, `UPDATE public.plans SET price_ngn = 1234 WHERE name = 'erudite'`);
    expect(await priceOf("erudite")).toBe(1234);
  });

  it("shows a student their own payments and nobody else's", async () => {
    const rows = await asUser(alice, `SELECT reference FROM public.subscription_payments`);
    expect(rows).toEqual([{ reference: "ref-alice" }]);
  });

  it("shows an admin every payment", async () => {
    const rows = await asUser(subAdmin, `SELECT reference FROM public.subscription_payments`);
    expect(rows.map((row) => (row as { reference: string }).reference).sort()).toEqual([
      "ref-alice",
      "ref-bob",
    ]);
  });

  it("refuses a student who tries to write a payment, so a plan cannot be 'bought' from the browser", async () => {
    await expect(
      asUser(
        alice,
        `INSERT INTO public.subscription_payments (user_id, plan_name, amount_ngn, duration_days)
         VALUES ($1, 'scholar', 0, 365)`,
        [alice],
      ),
    ).rejects.toThrow(/row-level security|permission denied/i);
  });
});

describe("profile (onboarding and the signed-in session)", () => {
  it("lets a student set their own onboarding fields", async () => {
    await asUser(alice, `UPDATE public.profiles SET first_name = 'Ada' WHERE id = $1`, [alice]);
    expect((await profileOf(alice)).first_name).toBe("Ada");
  });

  it("refuses a student who tries to change their own plan or usage", async () => {
    await expect(
      asUser(alice, `UPDATE public.profiles SET tier = 'scholar' WHERE id = $1`, [alice]),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asUser(alice, `UPDATE public.profiles SET questions_today = 0 WHERE id = $1`, [alice]),
    ).rejects.toThrow(/permission denied/i);
    expect((await profileOf(alice)).tier).toBe("novice");
  });

  it("does not let a student change somebody else's profile", async () => {
    await asUser(alice, `UPDATE public.profiles SET first_name = 'Hacked' WHERE id = $1`, [bob]);
    expect((await profileOf(bob)).first_name).not.toBe("Hacked");
  });

  it("does not show a student another student's profile", async () => {
    const rows = await asUser(alice, `SELECT id FROM public.profiles`);
    expect(rows).toEqual([{ id: alice }]);
  });
});
