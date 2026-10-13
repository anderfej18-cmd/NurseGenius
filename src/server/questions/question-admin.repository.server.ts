import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { examTypeSchema } from "@/lib/exam-type";
import type { Database } from "@/integrations/supabase/types";
import { mapDbError } from "../db-errors";
import { ConflictError } from "../errors";
import type { ExamType } from "../types";
import type {
  NewQuestionRow,
  QuestionAdminStore,
  QuestionChanges,
  QuestionStatus,
  Scope,
  Subtopic,
} from "./question-admin.service";

type QuestionUpdate = Database["public"]["Tables"]["questions"]["Update"];
const SUBTOPIC_COLUMNS = "id, exam_type, topic, name" as const;
const MAX_SUBTOPICS = 500;

const scopeSchema = z.object({ exam_type: examTypeSchema, topic: z.string() });
const subtopicSchema = scopeSchema.extend({ id: z.string(), name: z.string() });

const toScope = (row: z.infer<typeof scopeSchema>): Scope => ({
  examType: row.exam_type,
  topic: row.topic,
});
const toSubtopic = (row: z.infer<typeof subtopicSchema>): Subtopic => ({
  id: row.id,
  examType: row.exam_type,
  topic: row.topic,
  name: row.name,
});

interface DbError {
  message: string;
  code?: string;
}
/** A unique-violation on a subtopic means the name is taken; anything else is unexpected. */
const subtopicError = (error: DbError): unknown =>
  error.code === "23505" ? new ConflictError("That subtopic already exists.") : error;

/**
 * Question and subtopic writes. Service-role client: students and browser-side admins hold no write
 * grants on these tables, so this is the only write path (and the caller is checked as an admin first).
 */
export class SupabaseQuestionAdminStore implements QuestionAdminStore {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async insertMany(rows: readonly NewQuestionRow[]): Promise<number> {
    const { data, error } = await this.db
      .from("questions")
      .insert([...rows])
      .select("id");
    if (error) throw error;
    return data.length;
  }

  async update(id: string, changes: QuestionChanges): Promise<boolean> {
    return this.apply(id, changes);
  }

  async setStatus(id: string, status: QuestionStatus): Promise<boolean> {
    return this.apply(id, { status });
  }

  private async apply(id: string, changes: QuestionUpdate): Promise<boolean> {
    const { data, error } = await this.db
      .from("questions")
      .update(changes)
      .eq("id", id)
      .select("id");
    if (error) throw error;
    return data.length > 0;
  }

  async deleteForever(adminId: string, id: string): Promise<void> {
    const { error } = await this.db.rpc("admin_delete_question", {
      _admin_id: adminId,
      _question_id: id,
    });
    if (error) throw mapDbError(error);
  }

  async questionScope(id: string): Promise<Scope | null> {
    const { data, error } = await this.db
      .from("questions")
      .select("exam_type, topic")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data === null ? null : toScope(scopeSchema.parse(data));
  }

  async subtopicScope(id: string): Promise<Scope | null> {
    const { data, error } = await this.db
      .from("subtopics")
      .select("exam_type, topic")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data === null ? null : toScope(scopeSchema.parse(data));
  }

  async listSubtopics(examType: ExamType, topic?: string): Promise<Subtopic[]> {
    let query = this.db.from("subtopics").select(SUBTOPIC_COLUMNS).eq("exam_type", examType);
    if (topic !== undefined) query = query.eq("topic", topic);
    const { data, error } = await query.order("topic").order("name").limit(MAX_SUBTOPICS);
    if (error) throw error;
    return z.array(subtopicSchema).parse(data).map(toSubtopic);
  }

  async createSubtopic(input: Scope & { name: string }): Promise<Subtopic> {
    const { data, error } = await this.db
      .from("subtopics")
      .insert({ exam_type: input.examType, topic: input.topic, name: input.name })
      .select(SUBTOPIC_COLUMNS)
      .single();
    if (error) throw subtopicError(error);
    return toSubtopic(subtopicSchema.parse(data));
  }

  async renameSubtopic(id: string, name: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("subtopics")
      .update({ name })
      .eq("id", id)
      .select("id");
    if (error) throw subtopicError(error);
    return data.length > 0;
  }

  async deleteSubtopic(id: string): Promise<boolean> {
    const { data, error } = await this.db.from("subtopics").delete().eq("id", id).select("id");
    if (error) throw error;
    return data.length > 0;
  }
}
