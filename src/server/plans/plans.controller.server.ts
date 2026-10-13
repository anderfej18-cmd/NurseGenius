import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { guard } from "../errors";
import { SupabasePlanRepository } from "./plans.repository.server";
import { PlanService } from "./plans.service";

const service = () => new PlanService(new SupabasePlanRepository(supabaseAdmin));

export const plansController = {
  /** Public: the same rows the "anyone reads active plans" policy already shows an anonymous visitor. */
  listPublic: () => guard(() => service().listPublic()),
};
