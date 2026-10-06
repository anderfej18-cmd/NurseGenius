import { supabase } from "@/integrations/supabase/client";

const PAGE = 1000;

/**
 * Fetch the distinct list of topics (subcategories) for an exam type.
 * Pages through results because the Data API caps a single response at 1000 rows —
 * without paging, newly added subcategories beyond that cap never show up.
 */
export async function fetchTopics(examType: "RN" | "RM"): Promise<string[]> {
  const counts = await fetchTopicCounts(examType);
  return Object.keys(counts).sort();
}

/**
 * Question count per subcategory for one major category.
 * Pages through all rows so counts stay accurate past the 1000-row API cap.
 */
export async function fetchTopicCounts(
  examType: "RN" | "RM",
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("questions")
      .select("topic")
      .eq("exam_type", examType)
      .order("topic", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) break;
    for (const row of data ?? []) {
      if (row.topic) counts[row.topic] = (counts[row.topic] ?? 0) + 1;
    }
    if (!data || data.length < PAGE) break;
  }
  return counts;
}
