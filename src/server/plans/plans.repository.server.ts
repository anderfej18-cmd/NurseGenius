import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import type { PlanRepository } from "./plans.service";
import type { PublicPlan } from "@/lib/plans";

// Explicit columns, never "*": nothing but what the landing page shows leaves the database.
const rowSchema = z.object({
  name: z.string().min(1),
  price_ngn: z.coerce.number(),
  duration_days: z.number().int(),
});

export class SupabasePlanRepository implements PlanRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async listActive(): Promise<PublicPlan[]> {
    const { data, error } = await this.db
      .from("plans")
      .select("name, price_ngn, duration_days")
      .eq("is_active", true)
      .order("price_ngn", { ascending: true });
    if (error) throw error;
    return z
      .array(rowSchema)
      .parse(data)
      .map((row) => ({
        name: row.name,
        priceNgn: row.price_ngn,
        durationDays: row.duration_days,
      }));
  }
}
