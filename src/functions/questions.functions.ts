import { createServerFn } from "@tanstack/react-start";
import { validated } from "./validated";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  adminCreateQuestionSchema,
  adminCreateSubtopicSchema,
  adminImportQuestionsSchema,
  adminListQuestionsSchema,
  adminListSubtopicsSchema,
  adminRenameSubtopicSchema,
  adminUpdateQuestionSchema,
  listQuestionsSchema,
  questionIdSchema,
  subtopicIdSchema,
  topicCountsSchema,
} from "./questions.schemas";

// Client-safe module (AGENTS.md): server code is loaded with a dynamic import inside each handler.

/** Students: active questions without the answer key, filtered and cursor-paginated. */
export const listQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(listQuestionsSchema))
  .handler(async ({ data }) => {
    const { limit, cursor, ...filter } = data;
    const { catalogController } = await import("@/server/questions/catalog.controller.server");
    return catalogController.listForStudent(filter, { limit, cursor });
  });

export const getTopicCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(topicCountsSchema))
  .handler(async ({ data }) => {
    const { catalogController } = await import("@/server/questions/catalog.controller.server");
    return catalogController.topicCounts(data.examType);
  });

/** Admins only: includes the answer key and rationale and may include retired questions. */
export const adminListQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(adminListQuestionsSchema))
  .handler(async ({ data, context }) => {
    const { limit, cursor, ...filter } = data;
    const { catalogController } = await import("@/server/questions/catalog.controller.server");
    return catalogController.listForAdmin(context, filter, { limit, cursor });
  });

// ---- Admin content management: every function checks is_any_admin first (403 otherwise). ----

/** Adds one complete question to the bank. */
export const adminCreateQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(adminCreateQuestionSchema))
  .handler(async ({ data, context }) => {
    const { questionAdminController } =
      await import("@/server/questions/question-admin.controller.server");
    return questionAdminController.create(context, data);
  });

/** Adds up to 500 questions in one step; if any is incomplete none is added. */
export const adminImportQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(adminImportQuestionsSchema))
  .handler(async ({ data, context }) => {
    const { questionAdminController } =
      await import("@/server/questions/question-admin.controller.server");
    return questionAdminController.import(context, data);
  });

/** Repairs a question's content or sets its difficulty, tags, source or subtopic. */
export const adminUpdateQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(adminUpdateQuestionSchema))
  .handler(async ({ data, context }) => {
    const { questionAdminController } =
      await import("@/server/questions/question-admin.controller.server");
    return questionAdminController.update(context, data);
  });

/** Takes a question out of use. Questions are never deleted, so past attempts stay valid. */
export const adminRetireQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(questionIdSchema))
  .handler(async ({ data, context }) => {
    const { questionAdminController } =
      await import("@/server/questions/question-admin.controller.server");
    return questionAdminController.retire(context, data);
  });

/** Puts a retired question back in use. */
export const adminRestoreQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(questionIdSchema))
  .handler(async ({ data, context }) => {
    const { questionAdminController } =
      await import("@/server/questions/question-admin.controller.server");
    return questionAdminController.restore(context, data);
  });

/** The subtopics of an exam type, optionally of one topic. */
export const adminListSubtopics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(adminListSubtopicsSchema))
  .handler(async ({ data, context }) => {
    const { questionAdminController } =
      await import("@/server/questions/question-admin.controller.server");
    return questionAdminController.listSubtopics(context, data);
  });

/** Creates a subtopic under an exam type and topic. */
export const adminCreateSubtopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(adminCreateSubtopicSchema))
  .handler(async ({ data, context }) => {
    const { questionAdminController } =
      await import("@/server/questions/question-admin.controller.server");
    return questionAdminController.createSubtopic(context, data);
  });

/** Renames a subtopic. */
export const adminRenameSubtopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(adminRenameSubtopicSchema))
  .handler(async ({ data, context }) => {
    const { questionAdminController } =
      await import("@/server/questions/question-admin.controller.server");
    return questionAdminController.renameSubtopic(context, data);
  });

/** Deletes a subtopic; its questions stay and lose the link. */
export const adminDeleteSubtopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(subtopicIdSchema))
  .handler(async ({ data, context }) => {
    const { questionAdminController } =
      await import("@/server/questions/question-admin.controller.server");
    return questionAdminController.deleteSubtopic(context, data);
  });
