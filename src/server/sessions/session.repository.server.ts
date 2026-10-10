import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";
import { mapDbError } from "../db-errors";
import { QUOTA_COLUMNS, quotaFromRow } from "./quota-row";
import type { SessionRepository } from "./session.service";
import type {
  Confidence,
  ExamType,
  HistoryRow,
  PoolQuestion,
  Quota,
  SaveAnswerInput,
  SaveAnswerOutcome,
  SessionItemRow,
  SessionRecord,
  StartSessionRecord,
  SubmitResult,
} from "./session.types";

const POOL_PAGE_SIZE = 1000;

// The jsonb the submit function returns.
const submitResultSchema = z.object({
  exam_id: z.string(),
  already_completed: z.boolean(),
  correct_count: z.number(),
  total_questions: z.number(),
  score_pct: z.coerce.number(),
  auto_submitted: z.boolean(),
});
const confidenceSchema = z.enum(["low", "medium", "high"]);
const difficultySchema = z.enum(["easy", "medium", "hard"]).nullable();

function toConfidence(value: string | null): Confidence | null {
  return value === null ? null : confidenceSchema.parse(value);
}

/**
 * Data access for exam sessions. Runs with the service-role client, which bypasses RLS, so every
 * method that touches a student's data filters by `userId` itself.
 */
export class SupabaseSessionRepository implements SessionRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async getQuota(userId: string): Promise<Quota | null> {
    const { data, error } = await this.db
      .from("profiles")
      .select(QUOTA_COLUMNS)
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    return data === null ? null : quotaFromRow(data);
  }

  async listQuestionPool(examType: ExamType, topic: string | null): Promise<PoolQuestion[]> {
    const pool: PoolQuestion[] = [];
    let lastId: string | null = null;
    for (;;) {
      let query = this.db
        .from("questions")
        .select(
          "id, topic, difficulty, question_text, option_a, option_b, option_c, option_d, correct_answer",
        )
        .eq("exam_type", examType)
        .eq("status", "active")
        .order("id", { ascending: true })
        .limit(POOL_PAGE_SIZE);
      if (topic !== null) query = query.eq("topic", topic);
      if (lastId !== null) query = query.gt("id", lastId);
      const { data, error } = await query;
      if (error) throw error;
      pool.push(
        ...data.map((row) => ({ ...row, difficulty: difficultySchema.parse(row.difficulty) })),
      );
      if (data.length < POOL_PAGE_SIZE) return pool;
      lastId = data[data.length - 1].id;
    }
  }

  async listFocusQuestionIds(
    userId: string,
    examType: ExamType,
    focus: "mistakes" | "due",
    now: Date,
    limit: number,
  ): Promise<string[]> {
    let query = this.db
      .from("user_question_stats")
      .select("question_id, questions!inner(exam_type, status)")
      .eq("user_id", userId)
      .eq("questions.exam_type", examType)
      .eq("questions.status", "active");
    query =
      focus === "mistakes"
        ? query.eq("unresolved", true).order("last_missed_at", { ascending: false })
        : query
            .lte("next_review_at", now.toISOString())
            .order("next_review_at", { ascending: true });
    const { data, error } = await query.order("question_id", { ascending: true }).limit(limit);
    if (error) throw error;
    return data.map((row) => row.question_id);
  }

  async startSession(record: StartSessionRecord): Promise<string> {
    const { data, error } = await this.db.rpc("start_exam_session", {
      _user_id: record.userId,
      _exam_type: record.examType,
      _category: record.category,
      _session_type: record.sessionType,
      _time_limit_minutes: record.minutes,
      _topics: record.topics,
      _question_ids: record.questionIds,
      _today: record.today,
    });
    if (error) throw mapDbError(error);
    return data;
  }

  async getSession(userId: string, examId: string): Promise<SessionRecord | null> {
    const { data, error } = await this.db
      .from("exams")
      .select(
        "id, exam_type, category, session_type, status, started_at, deadline_at, completed_at, time_limit_minutes, total_questions, correct_count, score_pct, auto_submitted",
      )
      .eq("id", examId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id,
      examType: data.exam_type,
      category: data.category,
      sessionType: data.session_type,
      status: data.status,
      startedAt: data.started_at,
      deadlineAt: data.deadline_at,
      completedAt: data.completed_at,
      timeLimitMinutes: data.time_limit_minutes,
      totalQuestions: data.total_questions,
      correctCount: data.correct_count,
      scorePct: data.score_pct,
      autoSubmitted: data.auto_submitted,
    };
  }

  async listCompleted(userId: string, limit: number): Promise<HistoryRow[]> {
    const { data, error } = await this.db
      .from("exams")
      .select(
        "id, exam_type, category, session_type, completed_at, total_questions, correct_count, score_pct, score_verified, auto_submitted",
      )
      .eq("user_id", userId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data.flatMap((row) =>
      row.completed_at === null
        ? []
        : [
            {
              id: row.id,
              examType: row.exam_type,
              category: row.category,
              sessionType: row.session_type,
              completedAt: row.completed_at,
              totalQuestions: row.total_questions,
              correctCount: row.correct_count,
              scorePct: row.score_pct,
              scoreVerified: row.score_verified,
              autoSubmitted: row.auto_submitted,
            },
          ],
    );
  }

  async listItems(userId: string, examId: string): Promise<SessionItemRow[]> {
    const { data, error } = await this.db
      .from("exam_answers")
      .select(
        "id, question_id, position, user_answer, is_correct, flagged, confidence, selection_reason, questions(id, topic, question_text, option_a, option_b, option_c, option_d, correct_answer, rationale), exams!inner(user_id)",
      )
      .eq("exam_id", examId)
      .eq("exams.user_id", userId)
      .order("position", { ascending: true });
    if (error) throw error;
    return data.flatMap((row) =>
      row.questions
        ? [
            {
              answerId: row.id,
              questionId: row.question_id,
              position: row.position,
              userAnswer: row.user_answer,
              isCorrect: row.is_correct,
              flagged: row.flagged,
              confidence: toConfidence(row.confidence),
              selectionReason: row.selection_reason,
              question: row.questions,
            },
          ]
        : [],
    );
  }

  async recordSelectionReasons(
    userId: string,
    examId: string,
    reasons: Readonly<Record<string, string>>,
  ): Promise<void> {
    const { error } = await this.db.rpc("record_selection_reasons", {
      _user_id: userId,
      _exam_id: examId,
      _reasons: reasons,
    });
    if (error) throw error;
  }

  async saveAnswer(
    userId: string,
    input: SaveAnswerInput,
    graceSeconds: number,
  ): Promise<SaveAnswerOutcome> {
    const { data, error } = await this.db.rpc("save_exam_answer", {
      _user_id: userId,
      _exam_id: input.examId,
      _question_id: input.questionId,
      _grace_seconds: graceSeconds,
      _answer: input.answer,
      _confidence: input.confidence,
      _flagged: input.flagged,
      _hint_used: input.hintUsed,
      _time_spent_ms: input.timeSpentMs,
    });
    if (error) throw mapDbError(error);
    if (data === "ok" || data === "not_found" || data === "closed") return data;
    throw new Error(`Unexpected save_exam_answer result: ${String(data)}`);
  }

  async submit(userId: string, examId: string): Promise<SubmitResult> {
    const { data, error } = await this.db.rpc("submit_exam_session", {
      _user_id: userId,
      _exam_id: examId,
    });
    if (error) throw mapDbError(error);
    const result = submitResultSchema.parse(data);
    return {
      examId: result.exam_id,
      alreadyCompleted: result.already_completed,
      correctCount: result.correct_count,
      totalQuestions: result.total_questions,
      scorePct: result.score_pct,
      autoSubmitted: result.auto_submitted,
    };
  }
}
