import { ValidationError } from "../errors";
import type { ExamType } from "../types";
import type {
  AdminQuestionPage,
  CatalogFilter,
  CatalogPageRequest,
  CatalogQuery,
  CatalogRow,
  CatalogRowWithKey,
  StudentQuestionPage,
} from "./catalog.types";

const DEFAULT_LIMIT = 20;
const STUDENT_MAX_LIMIT = 50;
const ADMIN_MAX_LIMIT = 500;

export interface CatalogRepository {
  /** Explicit safe column list: the answer key is never selected. */
  listSafe(query: CatalogQuery): Promise<CatalogRow[]>;
  listWithKey(query: CatalogQuery): Promise<CatalogRowWithKey[]>;
  topicCounts(examType: ExamType): Promise<Array<{ topic: string; total: number }>>;
}

export class CatalogService {
  constructor(private readonly repository: CatalogRepository) {}

  async listForStudent(
    filter: CatalogFilter,
    page: CatalogPageRequest,
  ): Promise<StudentQuestionPage> {
    // Students see active questions only, whatever they ask for.
    const query = this.buildQuery({ ...filter, status: "active" }, page, STUDENT_MAX_LIMIT);
    const rows = await this.repository.listSafe(query);
    return paginate(rows.map(pickSafe), query.limit - 1);
  }

  async listForAdmin(filter: CatalogFilter, page: CatalogPageRequest): Promise<AdminQuestionPage> {
    const query = this.buildQuery(
      { ...filter, status: filter.status ?? "active" },
      page,
      ADMIN_MAX_LIMIT,
    );
    const rows = await this.repository.listWithKey(query);
    return paginate(rows, query.limit - 1);
  }

  async topicCounts(examType: ExamType): Promise<Record<string, number>> {
    const rows = await this.repository.topicCounts(examType);
    return Object.fromEntries(rows.map((row) => [row.topic, row.total]));
  }

  private buildQuery(
    filter: CatalogQuery["filter"],
    page: CatalogPageRequest,
    maxLimit: number,
  ): CatalogQuery {
    if (
      filter.yearFrom !== undefined &&
      filter.yearTo !== undefined &&
      filter.yearFrom > filter.yearTo
    ) {
      throw new ValidationError("The first year must not be after the last year.");
    }
    const limit = Math.min(Math.max(page.limit ?? DEFAULT_LIMIT, 1), maxLimit);
    return { filter, cursor: page.cursor, limit: limit + 1 };
  }
}

function paginate<T extends { id: string }>(
  rows: T[],
  pageSize: number,
): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, pageSize);
  return { items, nextCursor: rows.length > pageSize ? items[items.length - 1].id : null };
}

/** Explicit field list so nothing extra a repository returns can reach a student. */
function pickSafe(row: CatalogRow): CatalogRow {
  return {
    id: row.id,
    exam_type: row.exam_type,
    topic: row.topic,
    subtopic_id: row.subtopic_id,
    year: row.year,
    difficulty: row.difficulty,
    tags: row.tags,
    status: row.status,
    source: row.source,
    updated_at: row.updated_at,
    question_text: row.question_text,
    option_a: row.option_a,
    option_b: row.option_b,
    option_c: row.option_c,
    option_d: row.option_d,
  };
}
