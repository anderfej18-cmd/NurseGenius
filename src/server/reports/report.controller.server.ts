import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { assertAdmin } from "../access/admin-access.server";
import { guard } from "../errors";
import { SupabaseReportRepository } from "./report.repository.server";
import { ReportService } from "./report.service";
import type {
  CreateReportInput,
  PageRequest,
  ReportStatus,
  ResolveReportInput,
} from "./report.types";

interface Caller {
  userId: string;
  supabase: SupabaseClient<Database>;
}

const service = () =>
  new ReportService({
    repository: new SupabaseReportRepository(supabaseAdmin),
    clock: () => new Date(),
  });

export const reportController = {
  create: (userId: string, input: CreateReportInput) =>
    guard(() => service().create(userId, input)),
  listMine: (userId: string, page: PageRequest) => guard(() => service().listMine(userId, page)),
  listAll: (caller: Caller, filter: { status?: ReportStatus }, page: PageRequest) =>
    guard(async () => {
      await assertAdmin(caller.supabase, caller.userId);
      return service().listAll(filter, page);
    }),
  resolve: (caller: Caller, input: ResolveReportInput) =>
    guard(async () => {
      await assertAdmin(caller.supabase, caller.userId);
      return service().resolve(caller.userId, input);
    }),
};
