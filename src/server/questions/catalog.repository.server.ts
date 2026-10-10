import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ExamType } from "../types";
import type { CatalogRepository } from "./catalog.service";
import { z } from "zod";
import {
  catalogRowSchema,
  catalogRowWithKeySchema,
  type CatalogQuery,
  type CatalogRow,
  type CatalogRowWithKey,
} from "./catalog.types";

// Explicit column lists (never "*"). The answer key exists only in the admin list.
const SAFE_COLUMNS =
  "id, exam_type, topic, subtopic_id, year, difficulty, tags, status, source, updated_at, question_text, option_a, option_b, option_c, option_d" as const;
const KEY_COLUMNS = `${SAFE_COLUMNS}, correct_answer, rationale` as const;

export class SupabaseCatalogRepository implements CatalogRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async listSafe(query: CatalogQuery): Promise<CatalogRow[]> {
    const { data, error } = await this.filtered(
      this.db.from("questions").select(SAFE_COLUMNS),
      query,
    );
    if (error) throw error;
    return z.array(catalogRowSchema).parse(data);
  }

  async listWithKey(query: CatalogQuery): Promise<CatalogRowWithKey[]> {
    const { data, error } = await this.filtered(
      this.db.from("questions").select(KEY_COLUMNS),
      query,
    );
    if (error) throw error;
    return z.array(catalogRowWithKeySchema).parse(data);
  }

  async topicCounts(examType: ExamType): Promise<Array<{ topic: string; total: number }>> {
    const { data, error } = await this.db.rpc("get_question_topic_counts", {
      _exam_type: examType,
    });
    if (error) throw error;
    return data;
  }

  /** Applies every filter with bound parameters (no string building) and keyset pagination on id. */
  private filtered<B extends FilterableBuilder<B>>(
    builder: B,
    { filter, cursor, limit }: CatalogQuery,
  ): B {
    let query = builder.eq("exam_type", filter.examType);
    if (filter.status !== "all") query = query.eq("status", filter.status);
    if (filter.topics?.length) query = query.in("topic", filter.topics);
    if (filter.subtopicIds?.length) query = query.in("subtopic_id", filter.subtopicIds);
    if (filter.difficulty?.length) query = query.in("difficulty", filter.difficulty);
    if (filter.yearFrom !== undefined) query = query.gte("year", filter.yearFrom);
    if (filter.yearTo !== undefined) query = query.lte("year", filter.yearTo);
    if (cursor !== undefined) query = query.gt("id", cursor);
    return query.order("id", { ascending: true }).limit(limit);
  }
}

/** The slice of the PostgREST builder this repository uses, so one filter routine serves both selects. */
interface FilterableBuilder<Self> {
  eq(column: string, value: string): Self;
  in(column: string, values: readonly string[]): Self;
  gte(column: string, value: number): Self;
  lte(column: string, value: number): Self;
  gt(column: string, value: string): Self;
  order(column: string, options: { ascending: boolean }): Self;
  limit(count: number): Self;
}
