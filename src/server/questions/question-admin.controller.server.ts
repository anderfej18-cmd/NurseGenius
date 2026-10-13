import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { assertAdmin } from "../access/admin-access.server";
import { guard } from "../errors";
import type { Difficulty, ExamType } from "../types";
import { SupabaseQuestionAdminStore } from "./question-admin.repository.server";
import { type NewQuestionContent, QuestionAdminService } from "./question-admin.service";

const service = () =>
  new QuestionAdminService({ store: new SupabaseQuestionAdminStore(supabaseAdmin) });

interface Caller {
  userId: string;
  supabase: SupabaseClient<Database>;
}

/** Every operation is an admin operation: the caller is checked (is_any_admin) before anything else. */
const asAdmin = <T>(caller: Caller, operation: (admin: string) => Promise<T>) =>
  guard(async () => {
    await assertAdmin(caller.supabase, caller.userId);
    return operation(caller.userId);
  });

export const questionAdminController = {
  create: (
    caller: Caller,
    input: { examType: ExamType; topic: string; content: NewQuestionContent },
  ) => asAdmin(caller, (admin) => service().create(admin, input)),
  import: (
    caller: Caller,
    input: { examType: ExamType; topic: string; questions: NewQuestionContent[] },
  ) => asAdmin(caller, (admin) => service().import(admin, input)),
  update: (
    caller: Caller,
    input: {
      questionId: string;
      content?: NewQuestionContent;
      difficulty?: Difficulty | null;
      tags?: string[];
      source?: string | null;
      subtopicId?: string | null;
    },
  ) => asAdmin(caller, () => service().update(input)),
  delete: (caller: Caller, input: { questionId: string }) =>
    asAdmin(caller, (admin) => service().delete(admin, input.questionId)),
  retire: (caller: Caller, input: { questionId: string }) =>
    asAdmin(caller, () => service().retire(input.questionId)),
  restore: (caller: Caller, input: { questionId: string }) =>
    asAdmin(caller, () => service().restore(input.questionId)),
  listSubtopics: (caller: Caller, input: { examType: ExamType; topic?: string }) =>
    asAdmin(caller, () => service().listSubtopics(input)),
  createSubtopic: (caller: Caller, input: { examType: ExamType; topic: string; name: string }) =>
    asAdmin(caller, () => service().createSubtopic(input)),
  renameSubtopic: (caller: Caller, input: { subtopicId: string; name: string }) =>
    asAdmin(caller, () => service().renameSubtopic(input.subtopicId, input.name)),
  deleteSubtopic: (caller: Caller, input: { subtopicId: string }) =>
    asAdmin(caller, () => service().deleteSubtopic(input.subtopicId)),
};
