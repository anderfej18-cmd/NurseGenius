import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { examTypeSchema } from "@/lib/exam-type";
import type { Database, Json } from "@/integrations/supabase/types";
import { mapDbError } from "../db-errors";
import type {
  CustomTestStore,
  FinishedAttempt,
  NewCustomTest,
  SharedTestResult,
  SubmittedAnswer,
  TestSummary,
} from "./custom-tests.service";

// Explicit columns only: the key hash of an attempt and the answer key of a question never appear in a list.
const ATTEMPT_COLUMNS =
  "id, custom_test_id, email, score_pct, correct_count, total_questions, completed_at";
const SHARED_QUESTION_COLUMNS =
  "id, position, question_text, option_a, option_b, option_c, option_d";
const MAX_LISTED_ATTEMPTS = 2000;

const summarySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  exam_type: examTypeSchema,
  source_mode: z.string(),
  duration_minutes: z.number().int(),
  expires_at: z.string(),
  status: z.string(),
  created_at: z.string(),
  question_count: z.number().int(),
  participant_count: z.number().int(),
  pass_count: z.number().int(),
  average_score: z.coerce.number(),
});
const attemptSchema = z.object({
  id: z.string(),
  custom_test_id: z.string(),
  email: z.string(),
  score_pct: z.coerce.number().nullable(),
  correct_count: z.number().int().nullable(),
  total_questions: z.number().int(),
  completed_at: z.string().nullable(),
});
const publishedSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  exam_type: examTypeSchema,
  duration_minutes: z.number().int(),
  expires_at: z.string(),
});
const sharedQuestionSchema = z.object({
  id: z.string(),
  position: z.number().int(),
  question_text: z.string(),
  option_a: z.string(),
  option_b: z.string(),
  option_c: z.string(),
  option_d: z.string(),
});
const resultItemSchema = z.object({
  question_id: z.string(),
  question_position: z.number().int(),
  question_text: z.string(),
  option_a: z.string(),
  option_b: z.string(),
  option_c: z.string(),
  option_d: z.string(),
  correct_answer: z.string(),
  rationale: z.string().nullable(),
  user_answer: z.string().nullable(),
  is_correct: z.boolean(),
});
const resultSchema = z.object({
  score: z.number(),
  correct: z.number().int(),
  total: z.number().int(),
  results: z.array(resultItemSchema),
});

/** Shared tests. Service-role client: no browser role can read or write these tables or call these functions. */
export class SupabaseCustomTestStore implements CustomTestStore {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async createTest(ownerId: string, test: NewCustomTest): Promise<string> {
    const { data, error } = await this.db.rpc("create_custom_test", {
      _owner_id: ownerId,
      _title: test.title,
      _description: test.description,
      _exam_type: test.examType,
      _source_mode: test.sourceMode,
      _duration_minutes: test.durationMinutes,
      _expires_at: test.expiresAt,
      _token_hash: test.tokenHash,
      _questions: test.questions.map((question) => ({ ...question })) satisfies Json,
    });
    if (error) throw mapDbError(error);
    return z.string().parse(data);
  }

  async summaries(ownerId: string): Promise<TestSummary[]> {
    const { data, error } = await this.db.rpc("list_custom_test_summaries", { _owner_id: ownerId });
    if (error) throw error;
    return z.array(summarySchema).parse(data);
  }

  async completedAttempts(testIds: readonly string[]): Promise<FinishedAttempt[]> {
    const { data, error } = await this.db
      .from("custom_test_attempts")
      .select(ATTEMPT_COLUMNS)
      .in("custom_test_id", [...testIds])
      .eq("status", "completed")
      .order("score_pct", { ascending: false })
      .limit(MAX_LISTED_ATTEMPTS);
    if (error) throw error;
    return z.array(attemptSchema).parse(data);
  }

  async findPublished(tokenHash: string, now: Date) {
    const { data, error } = await this.db
      .from("custom_tests")
      .select("id, title, description, exam_type, duration_minutes, expires_at")
      .eq("token_hash", tokenHash)
      .eq("status", "published")
      .gt("expires_at", now.toISOString())
      .maybeSingle();
    if (error) throw error;
    if (data === null) return null;
    const row = publishedSchema.parse(data);
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      examType: row.exam_type,
      durationMinutes: row.duration_minutes,
      expiresAt: row.expires_at,
    };
  }

  async sharedQuestions(testId: string) {
    const { data, error } = await this.db
      .from("custom_test_questions")
      .select(SHARED_QUESTION_COLUMNS)
      .eq("custom_test_id", testId)
      .order("position");
    if (error) throw error;
    return z.array(sharedQuestionSchema).parse(data);
  }

  async countQuestions(testId: string): Promise<number> {
    const { count, error } = await this.db
      .from("custom_test_questions")
      .select("id", { count: "exact", head: true })
      .eq("custom_test_id", testId);
    if (error) throw error;
    return count ?? 0;
  }

  async insertAttempt(attempt: {
    testId: string;
    email: string;
    accessHash: string;
    totalQuestions: number;
  }) {
    const { data, error } = await this.db
      .from("custom_test_attempts")
      .insert({
        custom_test_id: attempt.testId,
        email: attempt.email,
        access_hash: attempt.accessHash,
        total_questions: attempt.totalQuestions,
      })
      .select("id, started_at")
      .single();
    if (error) throw mapDbError(error);
    return { attemptId: data.id, startedAt: data.started_at };
  }

  async submitAttempt(
    attemptId: string,
    accessHash: string,
    answers: readonly SubmittedAnswer[],
  ): Promise<SharedTestResult> {
    const { data, error } = await this.db.rpc("submit_shared_attempt", {
      _attempt_id: attemptId,
      _access_hash: accessHash,
      _answers: answers.map((answer) => ({ ...answer })) satisfies Json,
    });
    if (error) throw mapDbError(error);
    return resultSchema.parse(data);
  }

  async findAttempt(attemptId: string, accessHash: string) {
    const { data, error } = await this.db
      .from("custom_test_attempts")
      .select("id, email, user_id")
      .eq("id", attemptId)
      .eq("access_hash", accessHash)
      .maybeSingle();
    if (error) throw error;
    return data === null ? null : { id: data.id, email: data.email, userId: data.user_id };
  }

  async claimAttempt(attemptId: string, accessHash: string, userId: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("custom_test_attempts")
      .update({ user_id: userId })
      .eq("id", attemptId)
      .eq("access_hash", accessHash)
      .is("user_id", null)
      .select("id");
    if (error) throw error;
    return data.length > 0;
  }

  async republish(
    ownerId: string,
    testId: string,
    tokenHash: string,
    expiresAt: string,
  ): Promise<boolean> {
    const { data, error } = await this.db
      .from("custom_tests")
      .update({ status: "published", expires_at: expiresAt, token_hash: tokenHash })
      .eq("id", testId)
      .eq("owner_id", ownerId)
      .select("id");
    if (error) throw error;
    return data.length > 0;
  }

  async importToBank(ownerId: string, testId: string, topic: string): Promise<number> {
    const { data, error } = await this.db.rpc("import_custom_test_to_bank", {
      _admin_id: ownerId,
      _test_id: testId,
      _topic: topic,
    });
    if (error) throw mapDbError(error);
    return z.number().int().parse(data);
  }
}
