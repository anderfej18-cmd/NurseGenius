import type { PublicPlan } from "@/lib/plans";

/** What the service needs from storage: the active plans, in any order. */
export interface PlanRepository {
  listActive(): Promise<PublicPlan[]>;
}

export class PlanService {
  constructor(private readonly plans: PlanRepository) {}

  /**
   * The active plans for the public page, cheapest first. A row that cannot be a real offer (a
   * negative or non-finite price, or a length under a day) is left out rather than shown wrongly.
   */
  async listPublic(): Promise<PublicPlan[]> {
    const rows = await this.plans.listActive();
    return rows
      .filter(
        (plan) =>
          Number.isFinite(plan.priceNgn) &&
          plan.priceNgn >= 0 &&
          Number.isInteger(plan.durationDays) &&
          plan.durationDays >= 1,
      )
      .sort((a, b) => a.priceNgn - b.priceNgn || a.name.localeCompare(b.name));
  }
}
