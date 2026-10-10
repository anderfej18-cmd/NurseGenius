import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import type { SimilarCandidate, SimilarSource } from "./similar-questions";
import { examTypeSchema } from "@/lib/exam-type";

const difficulty = z.enum(["easy", "medium", "hard"]).nullable();

const sourceRowSchema = z.object({
  id: z.string(),
  exam_type: examTypeSchema,
  topic: z.string(),
  subtopic_id: z.string().nullable(),
  difficulty,
  tags: z.array(z.string()),
  question_text: z.string(),
});

const candidateRowSchema = sourceRowSchema.extend({
  year: z.number().nullable(),
  option_a: z.string(),
  option_b: z.string(),
  option_c: z.string(),
  option_d: z.string(),
});

const SOURCE_COLUMNS = "id, exam_type, topic, subtopic_id, difficulty, tags, question_text";
const CANDIDATE_COLUMNS = `${SOURCE_COLUMNS}, year, question_text, option_a, option_b, option_c, option_d`;

/** Reads question metadata for similarity. Never selects the answer key. */
export class SupabaseSimilarStore {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async getSource(questionId: string): Promise<SimilarSource | null> {
    const { data, error } = await this.db
      .from("questions")
      .select(SOURCE_COLUMNS)
      .eq("id", questionId)
      .maybeSingle();
    if (error) throw error;
    if (data === null) return null;
    const row = sourceRowSchema.parse(data);
    return {
      id: row.id,
      examType: row.exam_type,
      topic: row.topic,
      subtopicId: row.subtopic_id,
      difficulty: row.difficulty,
      tags: row.tags,
      questionText: row.question_text,
    };
  }

  /**
   * Active questions of the same exam type in the same topic or the same subtopic. Two plain
   * queries rather than one OR filter, so no text is ever spliced into a filter expression.
   */
  async listCandidates(source: SimilarSource, limit: number): Promise<SimilarCandidate[]> {
    const sameTopic = await this.query(source, limit, (query) => query.eq("topic", source.topic));
    const sameSubtopic =
      source.subtopicId === null
        ? []
        : await this.query(source, limit, (query) =>
            query.eq("subtopic_id", source.subtopicId as string),
          );

    const unique = new Map<string, SimilarCandidate>();
    for (const candidate of [...sameTopic, ...sameSubtopic]) unique.set(candidate.id, candidate);
    return [...unique.values()];
  }

  private async query(
    source: SimilarSource,
    limit: number,
    narrow: <Q extends Narrowable<Q>>(query: Q) => Q,
  ): Promise<SimilarCandidate[]> {
    const { data, error } = await narrow(
      this.db
        .from("questions")
        .select(CANDIDATE_COLUMNS)
        .eq("exam_type", source.examType)
        .eq("status", "active")
        .neq("id", source.id),
    )
      .order("id", { ascending: true })
      .limit(limit);
    if (error) throw error;

    return z
      .array(candidateRowSchema)
      .parse(data)
      .map((row) => ({
        id: row.id,
        examType: row.exam_type,
        topic: row.topic,
        subtopicId: row.subtopic_id,
        difficulty: row.difficulty,
        tags: row.tags,
        year: row.year,
        question: {
          question_text: row.question_text,
          option_a: row.option_a,
          option_b: row.option_b,
          option_c: row.option_c,
          option_d: row.option_d,
        },
      }));
  }
}

/** The one builder method the narrowing callbacks use. */
interface Narrowable<Self> {
  eq(column: string, value: string): Self;
}
