import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "../testing/fake-supabase";
import { SupabasePlanRepository } from "./plans.repository.server";

describe("SupabasePlanRepository", () => {
  it("selects only the three public columns, active plans only, cheapest first", async () => {
    const fake = createFakeSupabase([{ data: [] }]);
    await new SupabasePlanRepository(fake.client).listActive();
    const columns = String(fake.callsOn("from:plans", "select")[0].args[0]);
    expect(columns).toBe("name, price_ngn, duration_days");
    expect(columns).not.toContain("*");
    expect(fake.callsOn("from:plans", "eq")[0].args).toEqual(["is_active", true]);
    expect(fake.callsOn("from:plans", "order")[0].args).toEqual(["price_ngn", { ascending: true }]);
  });

  it("maps the rows to the public shape, reading a numeric price sent as text", async () => {
    const fake = createFakeSupabase([
      {
        data: [
          { name: "erudite", price_ngn: "4000", duration_days: 30 },
          { name: "scholar", price_ngn: 9000, duration_days: 90 },
        ],
      },
    ]);
    expect(await new SupabasePlanRepository(fake.client).listActive()).toEqual([
      { name: "erudite", priceNgn: 4000, durationDays: 30 },
      { name: "scholar", priceNgn: 9000, durationDays: 90 },
    ]);
  });

  it("rejects a row of the wrong shape instead of passing it on", async () => {
    const fake = createFakeSupabase([{ data: [{ name: "", price_ngn: 1, duration_days: 30 }] }]);
    await expect(new SupabasePlanRepository(fake.client).listActive()).rejects.toThrow();
  });

  it("throws the database error for the controller to hide", async () => {
    const fake = createFakeSupabase([{ error: { message: "boom" } }]);
    await expect(new SupabasePlanRepository(fake.client).listActive()).rejects.toMatchObject({
      message: "boom",
    });
  });
});
