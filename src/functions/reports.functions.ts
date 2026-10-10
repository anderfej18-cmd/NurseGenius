import { createServerFn } from "@tanstack/react-start";
import { validated } from "./validated";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  adminListReportsSchema,
  createReportSchema,
  listMyReportsSchema,
  resolveReportSchema,
} from "./reports.schemas";

// Client-safe module (AGENTS.md): server code is loaded with a dynamic import inside each handler.

export const createQuestionReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(createReportSchema))
  .handler(async ({ data, context }) => {
    const { reportController } = await import("@/server/reports/report.controller.server");
    return reportController.create(context.userId, data);
  });

export const listMyQuestionReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(listMyReportsSchema))
  .handler(async ({ data, context }) => {
    const { reportController } = await import("@/server/reports/report.controller.server");
    return reportController.listMine(context.userId, data);
  });

/** Admins only. */
export const adminListQuestionReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(adminListReportsSchema))
  .handler(async ({ data, context }) => {
    const { status, ...page } = data;
    const { reportController } = await import("@/server/reports/report.controller.server");
    return reportController.listAll(context, { status }, page);
  });

/** Admins only. */
export const resolveQuestionReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(resolveReportSchema))
  .handler(async ({ data, context }) => {
    const { reportController } = await import("@/server/reports/report.controller.server");
    return reportController.resolve(context, data);
  });
