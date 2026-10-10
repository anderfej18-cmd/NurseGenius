import type { ReportReason } from "@/lib/report-reasons";

export type { ReportReason };
export type ReportStatus = "open" | "resolved" | "dismissed";

/** Reports one student may file per UTC day (abuse guard). */
export const MAX_REPORTS_PER_DAY = 20;

export interface CreateReportInput {
  questionId: string;
  reason: ReportReason;
  details?: string;
}

export interface ResolveReportInput {
  reportId: string;
  status: "resolved" | "dismissed";
  note?: string;
}

export interface PageRequest {
  limit?: number;
  offset?: number;
}

export interface ReportRow {
  id: string;
  questionId: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  question: { question_text: string };
}

/** What an admin sees: who reported and the full question, answer key included. */
export interface AdminReportRow extends Omit<ReportRow, "question"> {
  reporterId: string;
  question: {
    topic: string;
    question_text: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    correct_answer: string;
    rationale: string | null;
  };
}

export type CreateReportOutcome = "created" | "duplicate";
export type ResolveReportOutcome = "resolved" | "not_found" | "not_open";
