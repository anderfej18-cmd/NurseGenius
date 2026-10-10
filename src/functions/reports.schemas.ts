import { z } from "zod";
import { REPORT_REASONS } from "@/lib/report-reasons";

const id = z.string().uuid();
const paging = {
  limit: z.number().int().min(1).max(50).optional(),
  offset: z.number().int().min(0).max(10_000).optional(),
};

export const createReportSchema = z
  .object({
    questionId: id,
    reason: z.enum(REPORT_REASONS),
    details: z.string().max(1000).optional(),
  })
  .strict();

export const listMyReportsSchema = z.object(paging).strict();

export const adminListReportsSchema = z
  .object({ status: z.enum(["open", "resolved", "dismissed"]).optional(), ...paging })
  .strict();

export const resolveReportSchema = z
  .object({
    reportId: id,
    status: z.enum(["resolved", "dismissed"]),
    note: z.string().max(1000).optional(),
  })
  .strict();
