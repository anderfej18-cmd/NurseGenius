import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type ExamType = Database["public"]["Enums"]["exam_type"];
type SnapshotQuestion = {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  rationale: string | null;
  source_question_id?: string | null;
  source_kind: "existing" | "custom";
};

const assertAdmin = async (context: { supabase: any; userId: string }) => {
  const { data, error } = await context.supabase.rpc("is_any_admin", { _user_id: context.userId });
  if (error || !data) throw new Error("You are not authorized to manage custom tests.");
};

const digest = async (value: string) => {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const createCustomTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    title: string; description: string; examType: ExamType; sourceMode: "existing" | "upload";
    durationMinutes: number; expiresAt: string; tokenHash: string; questions: SnapshotQuestion[];
  }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!data.title.trim() || data.questions.length < 1 || data.questions.length > 250) throw new Error("Enter a title and between 1 and 250 questions.");
    if (!/^[a-f0-9]{64}$/i.test(data.tokenHash)) throw new Error("Invalid test-link token.");
    if (data.durationMinutes < 10 || data.durationMinutes > 180) throw new Error("Duration must be between 10 minutes and 3 hours.");
    if (new Date(data.expiresAt).getTime() <= Date.now()) throw new Error("Link expiry must be in the future.");
    if (data.questions.some((question) => !question.question_text.trim() || !question.option_a.trim() || !question.option_b.trim() || !question.option_c.trim() || !question.option_d.trim() || !/^[ABCD]$/i.test(question.correct_answer))) {
      throw new Error("Every test question must include a question, four choices, and a valid correct answer.");
    }
    const { data: test, error } = await supabaseAdmin.from("custom_tests").insert({
      owner_id: context.userId,
      title: data.title.trim(),
      description: data.description.trim() || null,
      exam_type: data.examType,
      source_mode: data.sourceMode,
      duration_minutes: data.durationMinutes,
      expires_at: data.expiresAt,
      token_hash: data.tokenHash,
      status: "published",
    }).select("id").single();
    if (error) throw new Error(error.message);
    const rows = data.questions.map((question, position) => ({
      custom_test_id: test.id,
      source_question_id: question.source_question_id ?? null,
      source_kind: question.source_kind,
      question_text: question.question_text,
      option_a: question.option_a,
      option_b: question.option_b,
      option_c: question.option_c,
      option_d: question.option_d,
      correct_answer: question.correct_answer.toUpperCase(),
      rationale: question.rationale,
      position,
    }));
    const { error: questionsError } = await supabaseAdmin.from("custom_test_questions").insert(rows);
    if (questionsError) {
      await supabaseAdmin.from("custom_tests").delete().eq("id", test.id);
      throw new Error(questionsError.message);
    }
    return { id: test.id };
  });

export const listCustomTests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("custom_tests")
      .select("id, title, description, exam_type, source_mode, duration_minutes, expires_at, status, created_at, owner_id")
      .eq("owner_id", context.userId).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const tests = data ?? [];
    const summaries = await Promise.all(tests.map(async (test) => {
      const { data: attempts, error: attemptsError } = await supabaseAdmin.from("custom_test_attempts")
        .select("id, email, score_pct, correct_count, total_questions, completed_at")
        .eq("custom_test_id", test.id).eq("status", "completed").order("score_pct", { ascending: false }).limit(100);
      if (attemptsError) throw new Error(attemptsError.message);
      const { count } = await supabaseAdmin.from("custom_test_questions").select("id", { count: "exact", head: true }).eq("custom_test_id", test.id);
      const scores = (attempts ?? []).map((attempt) => Number(attempt.score_pct ?? 0));
      const passed = scores.filter((score) => score >= 50).length;
      const analytics = {
        participant_count: scores.length,
        pass_count: passed,
        fail_count: scores.length - passed,
        pass_pct: scores.length ? Number(((passed / scores.length) * 100).toFixed(2)) : 0,
        average_score: scores.length ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2)) : 0,
      };
      return { ...test, question_count: count ?? 0, analytics, attempts: attempts ?? [] };
    }));
    return summaries;
  });

export const getSharedTest = createServerFn({ method: "POST" })
  .inputValidator((data: { tokenHash: string }) => data)
  .handler(async ({ data }) => {
    if (!/^[a-f0-9]{64}$/i.test(data.tokenHash)) return { expired: true as const, test: null, questions: [] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: test, error } = await supabaseAdmin.from("custom_tests")
      .select("id, title, description, exam_type, duration_minutes, expires_at")
      .eq("token_hash", data.tokenHash).eq("status", "published").gt("expires_at", new Date().toISOString()).maybeSingle();
    if (error) throw new Error(error.message);
    if (!test) return { expired: true as const, test: null, questions: [] };
    const { data: questions, error: questionsError } = await supabaseAdmin.from("custom_test_questions")
      .select("id, position, question_text, option_a, option_b, option_c, option_d")
      .eq("custom_test_id", test.id).order("position");
    if (questionsError) throw new Error(questionsError.message);
    return {
      expired: false as const,
      test,
      questions: questions ?? [],
    };
  });

export const startSharedTest = createServerFn({ method: "POST" })
  .inputValidator((data: { tokenHash: string; email: string; accessKey: string }) => data)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address.");
    if (!/^[a-f0-9]{64}$/i.test(data.tokenHash) || data.accessKey.length < 32) throw new Error("Invalid test link or attempt key.");
    const { data: test, error: testError } = await supabaseAdmin.from("custom_tests")
      .select("id, duration_minutes, expires_at").eq("token_hash", data.tokenHash)
      .eq("status", "published").gt("expires_at", new Date().toISOString()).maybeSingle();
    if (testError || !test) throw new Error("This test link has expired or does not exist.");
    const { count, error: countError } = await supabaseAdmin.from("custom_test_questions")
      .select("id", { count: "exact", head: true }).eq("custom_test_id", test.id);
    if (countError || !count) throw new Error("This test has no questions.");
    const { data: attempt, error } = await supabaseAdmin.from("custom_test_attempts").insert({
      custom_test_id: test.id, email, access_hash: await digest(data.accessKey), total_questions: count,
    }).select("id, started_at").single();
    if (error) throw new Error(error.message);
    return { attemptId: attempt.id, durationMinutes: test.duration_minutes, totalQuestions: count, startedAt: attempt.started_at, accessKey: data.accessKey };
  });

export const submitSharedTest = createServerFn({ method: "POST" })
  .inputValidator((data: { attemptId: string; accessKey: string; answers: Array<{ question_id: string; user_answer: string | null }> }) => data)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.answers.length > 250 || data.answers.length < 1) throw new Error("Invalid answer list.");
    if (new Set(data.answers.map((answer) => answer.question_id)).size !== data.answers.length) throw new Error("Duplicate answers were submitted.");
    if (data.answers.some((answer) => answer.user_answer !== null && !/^[ABCD]$/i.test(answer.user_answer))) throw new Error("Invalid answer choice.");
    const accessHash = await digest(data.accessKey);
    const { data: attempt, error: attemptError } = await supabaseAdmin.from("custom_test_attempts")
      .select("id, custom_test_id, started_at, total_questions, status")
      .eq("id", data.attemptId).eq("access_hash", accessHash).maybeSingle();
    if (attemptError || !attempt) throw new Error("Attempt not found.");
    if (attempt.status === "completed") throw new Error("This test has already been submitted.");
    const { data: test, error: testError } = await supabaseAdmin.from("custom_tests").select("duration_minutes")
      .eq("id", attempt.custom_test_id).maybeSingle();
    if (testError || !test) throw new Error("Could not verify this test's time limit.");
    const deadline = new Date(attempt.started_at).getTime() + Number(test?.duration_minutes ?? 0) * 60_000;
    const { data: questions, error: questionsError } = await supabaseAdmin.from("custom_test_questions")
      .select("id, position, question_text, option_a, option_b, option_c, option_d, correct_answer, rationale")
      .eq("custom_test_id", attempt.custom_test_id).order("position");
    if (questionsError || !questions) throw new Error("Could not load test answers.");
    const validQuestionIds = new Set(questions.map((question) => question.id));
    if (data.answers.some((answer) => !validQuestionIds.has(answer.question_id))) throw new Error("An answer does not belong to this test.");
    const answered = data.answers.filter((answer) => answer.user_answer !== null).length;
    if (Date.now() < deadline && answered < Math.ceil(attempt.total_questions * 0.8)) {
      throw new Error(`Answer at least ${Math.ceil(attempt.total_questions * 0.8)} questions before submitting.`);
    }
    const answerById = new Map(data.answers.map((answer) => [answer.question_id, answer.user_answer?.toUpperCase() ?? null]));
    const results = questions.map((question) => {
      const answer = answerById.get(question.id) ?? null;
      return { question_id: question.id, question_position: question.position, question_text: question.question_text,
        option_a: question.option_a, option_b: question.option_b, option_c: question.option_c, option_d: question.option_d,
        correct_answer: question.correct_answer, rationale: question.rationale, user_answer: answer,
        is_correct: answer === question.correct_answer };
    });
    const correct = results.filter((result) => result.is_correct).length;
    const score = Number(((correct / attempt.total_questions) * 100).toFixed(2));
    const answerRows = results.map((result) => ({ attempt_id: attempt.id, custom_test_question_id: result.question_id,
      user_answer: result.user_answer, is_correct: result.is_correct, position: result.question_position }));
    const { error: answerWriteError } = await supabaseAdmin.from("custom_test_attempt_answers").upsert(answerRows, { onConflict: "attempt_id,custom_test_question_id" });
    if (answerWriteError) throw new Error(answerWriteError.message);
    const { error: completionError } = await supabaseAdmin.from("custom_test_attempts").update({
      completed_at: new Date().toISOString(), correct_count: correct, score_pct: score, status: "completed",
    }).eq("id", attempt.id).eq("access_hash", accessHash).eq("status", "in_progress");
    if (completionError) throw new Error(completionError.message);
    return { score, correct, total: attempt.total_questions, results };
  });

export const claimSharedTestAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { attemptId: string; accessKey: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: attempt, error: attemptError } = await supabaseAdmin.from("custom_test_attempts")
      .select("id, email, user_id").eq("id", data.attemptId).eq("access_hash", await digest(data.accessKey)).maybeSingle();
    if (attemptError || !attempt) throw new Error("Attempt not found.");
    if (attempt.email !== context.claims.email?.toLowerCase()) throw new Error("Sign in with the email used for this test.");
    if (attempt.user_id && attempt.user_id !== context.userId) throw new Error("This attempt belongs to another account.");
    const { data: updated, error } = await supabaseAdmin.from("custom_test_attempts")
      .update({ user_id: context.userId }).eq("id", data.attemptId).eq("access_hash", await digest(data.accessKey)).is("user_id", null).select("id");
    if (error) throw new Error(error.message);
    return { claimed: (updated?.length ?? 0) > 0 };
  });

export const republishCustomTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { testId: string; tokenHash: string; expiresAt: string }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (new Date(data.expiresAt).getTime() <= Date.now()) throw new Error("Expiry must be in the future.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error } = await supabaseAdmin.from("custom_tests")
      .update({ status: "published", expires_at: data.expiresAt, token_hash: data.tokenHash })
      .eq("id", data.testId).eq("owner_id", context.userId).select("id");
    if (error) throw new Error(error.message);
    if (!updated?.length) throw new Error("Test not found or not owned by you.");
    return { ok: true };
  });

export const importCustomTestQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { testId: string; topic: string; examType: ExamType }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (!data.topic.trim()) throw new Error("Enter the destination subcategory.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: test, error: testError } = await supabaseAdmin.from("custom_tests").select("id, exam_type").eq("id", data.testId).eq("owner_id", context.userId).maybeSingle();
    if (testError || !test) throw new Error("Test not found or not owned by you.");
    const { data: questions, error } = await supabaseAdmin.from("custom_test_questions").select("question_text, option_a, option_b, option_c, option_d, correct_answer, rationale")
      .eq("custom_test_id", data.testId).eq("imported_to_bank", false);
    if (error) throw new Error(error.message);
    if (!questions?.length) return { count: 0 };
    const { error: insertError } = await supabaseAdmin.from("questions").insert(questions.map((question) => ({ ...question, exam_type: test.exam_type, topic: data.topic.trim(), created_by: context.userId })));
    if (insertError) throw new Error(insertError.message);
    const { error: updateError } = await supabaseAdmin.from("custom_test_questions").update({ imported_to_bank: true, imported_at: new Date().toISOString() }).eq("custom_test_id", data.testId).eq("imported_to_bank", false);
    if (updateError) throw new Error(updateError.message);
    return { count: questions.length };
  });