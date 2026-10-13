import { describe, expect, it } from "vitest";
import { PlanService, type PlanRepository } from "./plans.service";
import type { PublicPlan } from "@/lib/plans";

const repo = (rows: PublicPlan[]): PlanRepository => ({ listActive: async () => rows });
const plan = (name: string, priceNgn: number, durationDays = 30): PublicPlan => ({
  name,
  priceNgn,
  durationDays,
});

describe("PlanService.listPublic", () => {
  it("returns the active plans cheapest first, breaking ties by name", async () => {
    const result = await new PlanService(
      repo([plan("scholar", 9000), plan("b", 0), plan("a", 0), plan("erudite", 4000)]),
    ).listPublic();
    expect(result.map((p) => p.name)).toEqual(["a", "b", "erudite", "scholar"]);
  });

  it("leaves out a row that cannot be a real offer", async () => {
    const result = await new PlanService(
      repo([
        plan("ok", 1000),
        plan("negative", -1),
        plan("nan", Number.NaN),
        plan("infinite", Number.POSITIVE_INFINITY),
        plan("zero-days", 1000, 0),
        plan("fractional-days", 1000, 1.5),
      ]),
    ).listPublic();
    expect(result.map((p) => p.name)).toEqual(["ok"]);
  });

  it("returns an empty list when there are no plans, not an error", async () => {
    expect(await new PlanService(repo([])).listPublic()).toEqual([]);
  });

  it("lets a storage failure through to the caller", async () => {
    const failing: PlanRepository = {
      listActive: async () => {
        throw new Error("down");
      },
    };
    await expect(new PlanService(failing).listPublic()).rejects.toThrow("down");
  });
});
