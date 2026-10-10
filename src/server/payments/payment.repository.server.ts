import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { mapDbError } from "../db-errors";
import type { BuyablePlan } from "./payment.service";

/** Plan prices and subscription activation. Service-role client; the activation function is closed to browsers. */
export class SupabasePaymentStore {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async activePrice(plan: BuyablePlan): Promise<number | null> {
    const { data, error } = await this.db
      .from("plans")
      .select("price_ngn")
      .eq("name", plan)
      .eq("is_active", true)
      .limit(1);
    if (error) throw error;
    const [row] = z.array(z.object({ price_ngn: z.coerce.number() })).parse(data);
    return row?.price_ngn ?? null;
  }

  async activate(input: {
    userId: string;
    tier: BuyablePlan;
    reference: string;
    amountNaira: number;
  }): Promise<string> {
    const { data, error } = await this.db.rpc("activate_verified_subscription", {
      _user_id: input.userId,
      _tier: input.tier,
      _reference: input.reference,
      _amount: input.amountNaira,
    });
    if (error) throw mapDbError(error);
    return z.string().parse(data);
  }
}
