import { adminListQuestions } from "@/functions/questions.functions";
import type { ExamType } from "@/lib/exam-type";

/** A question as the admin screens read it: text, options, answer key, rationale, topic and status. */
export type AdminQuestion = Awaited<ReturnType<typeof adminListQuestions>>["items"][number];

const TOPICS_PER_REQUEST = 50;
const QUESTIONS_PER_PAGE = 500;

/**
 * Questions with their answer key, read through the admin-only server function (the browser's own
 * database access no longer returns the key). Pages through the bank; topic filters are sent in
 * groups because a single request accepts at most 50 topics.
 */
export async function fetchAdminQuestions(filter: {
  examType: ExamType;
  topics?: string[];
  status?: "active" | "retired" | "all";
}) {
  const groups: Array<string[] | undefined> = [];
  if (filter.topics === undefined) groups.push(undefined);
  else
    for (let i = 0; i < filter.topics.length; i += TOPICS_PER_REQUEST)
      groups.push(filter.topics.slice(i, i + TOPICS_PER_REQUEST));

  const rows: AdminQuestion[] = [];
  for (const topics of groups) {
    let cursor: string | undefined;
    do {
      const page = await adminListQuestions({
        data: {
          examType: filter.examType,
          topics,
          status: filter.status,
          cursor,
          limit: QUESTIONS_PER_PAGE,
        },
      });
      rows.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
  }
  return rows;
}
