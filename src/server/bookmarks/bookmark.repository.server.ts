import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { BookmarkRepository } from "./bookmark.service";
import type { BookmarkQuery, BookmarkRow } from "./bookmark.types";

/** Service-role client: every query filters by `user_id` itself. Never selects the answer key. */
export class SupabaseBookmarkRepository implements BookmarkRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async questionIsActive(questionId: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("questions")
      .select("id")
      .eq("id", questionId)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw error;
    return data !== null;
  }

  async has(userId: string, questionId: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("bookmarks")
      .select("id")
      .eq("user_id", userId)
      .eq("question_id", questionId)
      .maybeSingle();
    if (error) throw error;
    return data !== null;
  }

  async count(userId: string): Promise<number> {
    const { count, error } = await this.db
      .from("bookmarks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (error) throw error;
    return count ?? 0;
  }

  async upsert(userId: string, questionId: string, note: string | null): Promise<void> {
    const { error } = await this.db
      .from("bookmarks")
      .upsert(
        { user_id: userId, question_id: questionId, note },
        { onConflict: "user_id,question_id" },
      );
    if (error) throw error;
  }

  async remove(userId: string, questionId: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("bookmarks")
      .delete()
      .eq("user_id", userId)
      .eq("question_id", questionId)
      .select("id");
    if (error) throw error;
    return data.length > 0;
  }

  async list(
    userId: string,
    { examType, topic, limit, offset }: BookmarkQuery,
  ): Promise<BookmarkRow[]> {
    let query = this.db
      .from("bookmarks")
      .select(
        "question_id, note, created_at, questions!inner(exam_type, topic, question_text, option_a, option_b, option_c, option_d)",
      )
      .eq("user_id", userId);
    if (examType !== undefined) query = query.eq("questions.exam_type", examType);
    if (topic !== undefined) query = query.eq("questions.topic", topic);
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .order("question_id", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return data.map((row) => ({
      questionId: row.question_id,
      note: row.note,
      createdAt: row.created_at,
      question: row.questions,
    }));
  }
}
