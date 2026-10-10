import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { assertAdmin } from "../access/admin-access.server";
import { guard } from "../errors";
import type { ExamType } from "../types";
import { SupabaseCatalogRepository } from "./catalog.repository.server";
import { CatalogService } from "./catalog.service";
import type { CatalogFilter, CatalogPageRequest } from "./catalog.types";

const service = () => new CatalogService(new SupabaseCatalogRepository(supabaseAdmin));

export const catalogController = {
  listForStudent: (filter: CatalogFilter, page: CatalogPageRequest) =>
    guard(() => service().listForStudent(filter, page)),
  topicCounts: (examType: ExamType) => guard(() => service().topicCounts(examType)),
  listForAdmin: (
    caller: { userId: string; supabase: SupabaseClient<Database> },
    filter: CatalogFilter,
    page: CatalogPageRequest,
  ) =>
    guard(async () => {
      await assertAdmin(caller.supabase, caller.userId);
      return service().listForAdmin(filter, page);
    }),
};
