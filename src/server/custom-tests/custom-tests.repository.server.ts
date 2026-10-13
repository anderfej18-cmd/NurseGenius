import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { examTypeSchema } from "@/lib/exam-type";
import type { Database, Json } from "@/integrations/supabase/types";
import { mapDbError } from "../db-errors";
import type { ExamType } from "../types";
import type {
  AttemptView,
  CustomTestStore,
  FinishedAttempt,
  NewLiveTest,
  Schedule,
  ShareLink,
  SharedTestResult,
  SharedTestState,
  SubmittedAnswer,
  TestSummary,
} from "./custom-tests.service";

const stateName = z.enum(["upcoming", "live", "closed"]);

const summarySchema = z.object({
  id: z.string(),
  owner_id: z.string(),
  owner_username: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  exam_type: examTypeSchema,
  source_mode: z.string(),
  duration_minutes: z.number().int(),
  starts_at: z.string(),
  expires_at: z.string(),
  status: z.string(),
  created_at: z.string(),
  share_token: z.string().nullable(),
  state: stateName,
  question_count: z.number().int(),
  participant_count: z.number().int(),
  pass_count: z.number().int(),
  average_score: z.coerce.number(),
  custom_unimported: z.number().int(),
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
const stateBase = z.object({ state: stateName, server_now: z.string() });
/** A link that exists says what the test is; one that does not (or is unknown) says only that it is closed. */
const stateSchema = z.union([
  stateBase.extend({
    title: z.string(),
    description: z.string().nullable(),
    exam_type: examTypeSchema,
    duration_minutes: z.number().int(),
    question_count: z.number().int(),
    starts_at: z.string(),
    expires_at: z.string(),
  }),
  stateBase,
]);
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
  score: z.coerce.number(),
  correct: z.number().int(),
  total: z.number().int(),
  results: z.array(resultItemSchema),
});
const attemptViewSchema = z.object({
  status: z.enum(["in_progress", "completed", "abandoned"]),
  server_now: z.string(),
  started_at: z.string(),
  deadline_at: z.string(),
  test: z.object({
    title: z.string(),
    description: z.string().nullable(),
    exam_type: examTypeSchema,
    duration_minutes: z.number().int(),
  }),
  user_id: z.string().nullable(),
  email: z.string(),
  questions: z.array(
    z.object({
      id: z.string(),
      position: z.number().int(),
      question_text: z.string(),
      option_a: z.string(),
      option_b: z.string(),
      option_c: z.string(),
      option_d: z.string(),
      answer: z.string().nullable(),
      flagged: z.boolean(),
    }),
  ),
  result: resultSchema.nullable(),
});
const startedSchema = z.object({ attempt_id: z.string() });
const importSchema = z.object({ added: z.number().int(), skipped: z.number().int() });

/** Live tests. Service-role client: no browser role can call these functions or write these tables. */
export class SupabaseCustomTestStore implements CustomTestStore {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async createTest(ownerId: string, test: NewLiveTest, link: ShareLink): Promise<string> {
    const { data, error } = await this.db.rpc("create_live_test", {
      _owner_id: ownerId,
      _title: test.title,
      _description: test.description,
      _exam_type: test.examType,
      _source_mode: test.sourceMode,
      _duration_minutes: test.durationMinutes,
      _starts_at: test.startsAt,
      _expires_at: test.expiresAt,
      _token_hash: link.tokenHash,
      _share_token: link.token,
      _questions: test.questions.map((question) => ({ ...question })) satisfies Json,
      _allocations: test.allocations.map((allocation) => ({ ...allocation })) satisfies Json,
    });
    if (error) throw mapDbError(error);
    return z.string().parse(data);
  }

  async republish(
    actorId: string,
    testId: string,
    schedule: Schedule,
    link: ShareLink,
  ): Promise<void> {
    const { error } = await this.db.rpc("republish_live_test", {
      _actor_id: actorId,
      _test_id: testId,
      _token_hash: link.tokenHash,
      _share_token: link.token,
      _starts_at: schedule.startsAt,
      _expires_at: schedule.expiresAt,
      _duration_minutes: schedule.durationMinutes,
    });
    if (error) throw mapDbError(error);
  }

  async tests(actorId: string): Promise<TestSummary[]> {
    const { data, error } = await this.db.rpc("list_live_tests", { _actor_id: actorId });
    if (error) throw mapDbError(error);
    return z.array(summarySchema).parse(data);
  }

  async closedAttempts(actorId: string, testIds: readonly string[]): Promise<FinishedAttempt[]> {
    const { data, error } = await this.db.rpc("list_test_attempts", {
      _actor_id: actorId,
      _test_ids: [...testIds],
    });
    if (error) throw mapDbError(error);
    return z.array(attemptSchema).parse(data);
  }

  async importQuestions(
    actorId: string,
    testId: string,
    examType: ExamType,
    topic: string,
  ): Promise<{ added: number; skipped: number }> {
    const { data, error } = await this.db.rpc("import_live_test_questions", {
      _actor_id: actorId,
      _test_id: testId,
      _exam_type: examType,
      _topic: topic,
    });
    if (error) throw mapDbError(error);
    return importSchema.parse(data);
  }

  async sharedState(tokenHash: string): Promise<SharedTestState> {
    const { data, error } = await this.db.rpc("get_shared_test_state", { _token_hash: tokenHash });
    if (error) throw mapDbError(error);
    const row = stateSchema.parse(data);
    return {
      state: row.state,
      serverNow: row.server_now,
      test:
        "title" in row
          ? {
              title: row.title,
              description: row.description,
              examType: row.exam_type,
              durationMinutes: row.duration_minutes,
              questionCount: row.question_count,
              startsAt: row.starts_at,
              expiresAt: row.expires_at,
            }
          : null,
    };
  }

  async startAttempt(tokenHash: string, email: string, accessHash: string) {
    const { data, error } = await this.db.rpc("start_shared_attempt", {
      _token_hash: tokenHash,
      _email: email,
      _access_hash: accessHash,
    });
    if (error) throw mapDbError(error);
    return { attemptId: startedSchema.parse(data).attempt_id };
  }

  async attempt(attemptId: string, accessHash: string): Promise<AttemptView> {
    const { data, error } = await this.db.rpc("get_shared_attempt", {
      _attempt_id: attemptId,
      _access_hash: accessHash,
    });
    if (error) throw mapDbError(error);
    const row = attemptViewSchema.parse(data);
    return {
      status: row.status,
      serverNow: row.server_now,
      startedAt: row.started_at,
      deadlineAt: row.deadline_at,
      test: {
        title: row.test.title,
        description: row.test.description,
        examType: row.test.exam_type,
        durationMinutes: row.test.duration_minutes,
      },
      email: row.email,
      linked: row.user_id !== null,
      questions: row.questions,
      result: row.result,
    };
  }

  async saveAnswer(input: {
    attemptId: string;
    accessHash: string;
    questionId: string;
    answer: string | null;
    flagged: boolean;
  }): Promise<void> {
    const { error } = await this.db.rpc("save_shared_answer", {
      _attempt_id: input.attemptId,
      _access_hash: input.accessHash,
      _question_id: input.questionId,
      _answer: input.answer ?? undefined,
      _flagged: input.flagged,
    });
    if (error) throw mapDbError(error);
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
}
