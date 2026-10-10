import { createServerFn } from "@tanstack/react-start";
import { validated } from "./validated";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { HISTORY_MAX } from "@/lib/exam-rules";
import {
  examIdSchema,
  historySchema,
  saveAnswerSchema,
  startSessionSchema,
} from "./sessions.schemas";

// Client-safe module (AGENTS.md): server code is loaded with a dynamic import inside each handler.

export const startExamSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(startSessionSchema))
  .handler(async ({ data, context }) => {
    const { sessionController } = await import("@/server/sessions/session.controller.server");
    return sessionController.start(context.userId, data);
  });

// POST rather than GET: reading a session past its deadline finalises it.
export const getExamSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(examIdSchema))
  .handler(async ({ data, context }) => {
    const { sessionController } = await import("@/server/sessions/session.controller.server");
    return sessionController.get(context.userId, data.examId);
  });

export const saveExamAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(saveAnswerSchema))
  .handler(async ({ data, context }) => {
    const { sessionController } = await import("@/server/sessions/session.controller.server");
    return sessionController.saveAnswer(context.userId, data);
  });

export const submitExamSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(examIdSchema))
  .handler(async ({ data, context }) => {
    const { sessionController } = await import("@/server/sessions/session.controller.server");
    return sessionController.submit(context.userId, data.examId);
  });

export const getExamResults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(examIdSchema))
  .handler(async ({ data, context }) => {
    const { sessionController } = await import("@/server/sessions/session.controller.server");
    return sessionController.results(context.userId, data.examId);
  });

/** The student's finished tests, newest first, with the average of the verified scores. */
export const listExamHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(historySchema))
  .handler(async ({ data, context }) => {
    const { sessionController } = await import("@/server/sessions/session.controller.server");
    return sessionController.history(context.userId, data.limit ?? HISTORY_MAX);
  });
