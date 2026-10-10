import { ConflictError, LimitReachedError, NotFoundError, ValidationError } from "../errors";
import { offsetBounds, toOffsetPage } from "../pagination";
import type { OffsetPage } from "../types";
import {
  MAX_REPORTS_PER_DAY,
  type AdminReportRow,
  type CreateReportInput,
  type CreateReportOutcome,
  type PageRequest,
  type ReportRow,
  type ReportStatus,
  type ResolveReportInput,
  type ResolveReportOutcome,
} from "./report.types";

const MAX_TEXT_LENGTH = 1000;

interface ListQuery {
  limit: number;
  offset: number;
}

export interface ReportRepository {
  questionExists(questionId: string): Promise<boolean>;
  countCreatedSince(userId: string, sinceIso: string): Promise<number>;
  /** Returns "duplicate" when the student already has an open report with the same reason for the question. */
  create(
    userId: string,
    input: { questionId: string; reason: CreateReportInput["reason"]; details: string | null },
  ): Promise<CreateReportOutcome>;
  listMine(userId: string, query: ListQuery): Promise<ReportRow[]>;
  listAll(query: ListQuery & { status?: ReportStatus }): Promise<AdminReportRow[]>;
  /** Only an open report can be resolved; the update is guarded in a single statement. */
  resolve(input: {
    reportId: string;
    adminId: string;
    status: "resolved" | "dismissed";
    note: string | null;
    at: string;
  }): Promise<ResolveReportOutcome>;
}

interface Dependencies {
  repository: ReportRepository;
  clock: () => Date;
}

export class ReportService {
  constructor(private readonly deps: Dependencies) {}

  async create(userId: string, input: CreateReportInput): Promise<{ ok: true }> {
    const details = trimmedOrNull(input.details, "Details");
    const { repository, clock } = this.deps;

    if (!(await repository.questionExists(input.questionId)))
      throw new NotFoundError("Question not found.");

    const startOfDay = new Date(clock());
    startOfDay.setUTCHours(0, 0, 0, 0);
    if (
      (await repository.countCreatedSince(userId, startOfDay.toISOString())) >= MAX_REPORTS_PER_DAY
    ) {
      throw new LimitReachedError(
        "You have reached today's limit for reporting questions. Please try again tomorrow.",
      );
    }

    const outcome = await repository.create(userId, {
      questionId: input.questionId,
      reason: input.reason,
      details,
    });
    if (outcome === "duplicate")
      throw new ConflictError("You have already reported this question for that reason.");
    return { ok: true };
  }

  async listMine(userId: string, request: PageRequest): Promise<OffsetPage<ReportRow>> {
    const { offset, limit } = offsetBounds(request);
    const rows = await this.deps.repository.listMine(userId, { limit: limit + 1, offset });
    return toOffsetPage(rows, limit, offset);
  }

  async listAll(
    filter: { status?: ReportStatus },
    request: PageRequest,
  ): Promise<OffsetPage<AdminReportRow>> {
    const { offset, limit } = offsetBounds(request);
    const rows = await this.deps.repository.listAll({
      status: filter.status,
      limit: limit + 1,
      offset,
    });
    return toOffsetPage(rows, limit, offset);
  }

  async resolve(adminId: string, input: ResolveReportInput): Promise<{ ok: true }> {
    const note = trimmedOrNull(input.note, "Note");
    const outcome = await this.deps.repository.resolve({
      reportId: input.reportId,
      adminId,
      status: input.status,
      note,
      at: this.deps.clock().toISOString(),
    });
    if (outcome === "not_found") throw new NotFoundError("Report not found.");
    if (outcome === "not_open") throw new ConflictError("This report has already been handled.");
    return { ok: true };
  }
}

function trimmedOrNull(value: string | undefined, label: string): string | null {
  const text = value?.trim() || null;
  if (text !== null && text.length > MAX_TEXT_LENGTH) {
    throw new ValidationError(`${label} can be at most ${MAX_TEXT_LENGTH} characters.`);
  }
  return text;
}
