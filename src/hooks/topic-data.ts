import { getTopicCounts } from "@/functions/questions.functions";

/**
 * Question count per topic for one major category: active questions only, counted by the server in
 * one grouped query (the browser no longer pages through every row).
 */
export async function fetchTopicCounts(examType: "RN" | "RM"): Promise<Record<string, number>> {
  return getTopicCounts({ data: { examType } });
}

/** The topics (subcategories) of an exam type, alphabetically. */
export async function fetchTopics(examType: "RN" | "RM"): Promise<string[]> {
  return Object.keys(await fetchTopicCounts(examType)).sort();
}
