import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { REPORT_REASONS } from "@/lib/report-reasons";
import type { Database } from "@/integrations/supabase/types";
import type { ReportRepository } from "./report.service";
import type { AdminReportRow, ReportReason, ReportRow, ReportStatus } from "./report.types";

const UNIQUE_VIOLATION = "23505";

const statusSchema = z.enum(["open", "resolved", "dismissed"]);
const reasonSchema = z.enum(REPORT_REASONS);
// Parsed rather than cast: a value the CHECK constraint should prevent fails loudly.
const toStatus = (value: string): ReportStatus => statusSchema.parse(value);
const toReason = (value: string): ReportReason => reasonSchema.parse(value);

/** Service-role client: ownership and admin checks are enforced by the caller and the query filters. */
export class SupabaseReportRepository implements ReportRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async questionExists(questionId: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("questions")
      .select("id")
      .eq("id", questionId)
      .maybeSingle();
    if (error) throw error;
    return data !== null;
  }

  async countCreatedSince(userId: string, sinceIso: string): Promise<number> {
    const { count, error } = await this.db
      .from("question_reports")
      .select("id", { count: "exact", head: true })
      .eq("reporter_id", userId)
      .gte("created_at", sinceIso);
    if (error) throw error;
    return count ?? 0;
  }

  async create(
    userId: string,
    input: { questionId: string; reason: ReportReason; details: string | null },
  ) {
    const { error } = await this.db.from("question_reports").insert({
      question_id: input.questionId,
      reporter_id: userId,
      reason: input.reason,
      details: input.details,
    });
    if (error?.code === UNIQUE_VIOLATION) return "duplicate" as const;
    if (error) throw error;
    return "created" as const;
  }

  async listMine(
    userId: string,
    { limit, offset }: { limit: number; offset: number },
  ): Promise<ReportRow[]> {
    const { data, error } = await this.db
      .from("question_reports")
      .select(
        "id, question_id, reason, details, status, resolution_note, created_at, resolved_at, questions!inner(question_text)",
      )
      .eq("reporter_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return data.map((row) => ({
      id: row.id,
      questionId: row.question_id,
      reason: toReason(row.reason),
      details: row.details,
      status: toStatus(row.status),
      resolutionNote: row.resolution_note,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
      question: { question_text: row.questions.question_text },
    }));
  }

  async listAll({
    status,
    limit,
    offset,
  }: {
    status?: ReportStatus;
    limit: number;
    offset: number;
  }): Promise<AdminReportRow[]> {
    let query = this.db
      .from("question_reports")
      .select(
        "id, question_id, reporter_id, reason, details, status, resolution_note, created_at, resolved_at, questions!inner(topic, question_text, option_a, option_b, option_c, option_d, correct_answer, rationale)",
      );
    if (status !== undefined) query = query.eq("status", status);
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return data.map((row) => ({
      id: row.id,
      questionId: row.question_id,
      reporterId: row.reporter_id,
      reason: toReason(row.reason),
      details: row.details,
      status: toStatus(row.status),
      resolutionNote: row.resolution_note,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
      question: row.questions,
    }));
  }

  async resolve(input: {
    reportId: string;
    adminId: string;
    status: "resolved" | "dismissed";
    note: string | null;
    at: string;
  }) {
    // One guarded statement: only a still-open report is updated, so concurrent resolvers cannot both win.
    const { data, error } = await this.db
      .from("question_reports")
      .update({
        status: input.status,
        resolution_note: input.note,
        resolved_by: input.adminId,
        resolved_at: input.at,
      })
      .eq("id", input.reportId)
      .eq("status", "open")
      .select("id");
    if (error) throw error;
    if (data.length > 0) return "resolved" as const;

    const { data: existing, error: lookupError } = await this.db
      .from("question_reports")
      .select("id")
      .eq("id", input.reportId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    return existing ? ("not_open" as const) : ("not_found" as const);
  }
}
