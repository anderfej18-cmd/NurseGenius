import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { guard } from "../errors";
import { SupabaseMistakeRepository } from "./mistake.repository.server";
import { MistakeService } from "./mistake.service";
import type { MistakeRequest } from "./mistake.types";

const service = () =>
  new MistakeService({
    repository: new SupabaseMistakeRepository(supabaseAdmin),
    clock: () => new Date(),
  });

export const mistakeController = {
  list: (userId: string, request: MistakeRequest) => guard(() => service().list(userId, request)),
};
