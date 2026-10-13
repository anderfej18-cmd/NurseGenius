// What the results screen shows, derived from what the server released after submission. The score and
// the correctness of every answer come from the server; this file only groups and words them. Nothing
// here scores a test.

export interface ResultItem {
  readonly user_answer: string | null;
  readonly is_correct: boolean | null;
  readonly flagged: boolean;
  readonly questions: { readonly topic: string };
}

export type ResultStatus = "correct" | "wrong" | "skipped";
export type ResultFilter = "all" | "wrong" | "skipped" | "flagged";

export function statusOf(item: Pick<ResultItem, "user_answer" | "is_correct">): ResultStatus {
  if (item.is_correct === true) return "correct";
  return item.user_answer !== null ? "wrong" : "skipped";
}

export function filterItems<T extends ResultItem>(items: readonly T[], filter: ResultFilter): T[] {
  switch (filter) {
    case "wrong":
      return items.filter((item) => statusOf(item) === "wrong");
    case "skipped":
      return items.filter((item) => statusOf(item) === "skipped");
    case "flagged":
      return items.filter((item) => item.flagged);
    default:
      return [...items];
  }
}

export interface Breakdown {
  readonly total: number;
  readonly attempted: number;
  readonly correct: number;
  readonly wrong: number;
  readonly skipped: number;
  readonly flagged: number;
}

export function breakdown(items: readonly ResultItem[]): Breakdown {
  const count = (status: ResultStatus) => items.filter((item) => statusOf(item) === status).length;
  return {
    total: items.length,
    attempted: items.filter((item) => item.user_answer !== null).length,
    correct: count("correct"),
    wrong: count("wrong"),
    skipped: count("skipped"),
    flagged: items.filter((item) => item.flagged).length,
  };
}

export interface TopicResult {
  readonly topic: string;
  readonly total: number;
  readonly correct: number;
  readonly wrong: number;
  readonly skipped: number;
}

/** Per topic, most missed first (wrong and skipped together), then alphabetical. */
export function topicBreakdown(items: readonly ResultItem[]): TopicResult[] {
  const byTopic = new Map<
    string,
    { total: number; correct: number; wrong: number; skipped: number }
  >();
  for (const item of items) {
    const row = byTopic.get(item.questions.topic) ?? { total: 0, correct: 0, wrong: 0, skipped: 0 };
    row.total += 1;
    row[statusOf(item)] += 1;
    byTopic.set(item.questions.topic, row);
  }
  return [...byTopic.entries()]
    .map(([topic, row]) => ({ topic, ...row }))
    .sort((a, b) => b.wrong + b.skipped - (a.wrong + a.skipped) || a.topic.localeCompare(b.topic));
}

/** Topics where something was missed, worst first, for the "practise next" suggestions. */
export function topicsToPractise(items: readonly ResultItem[], max = 3): TopicResult[] {
  return topicBreakdown(items)
    .filter((row) => row.wrong + row.skipped > 0)
    .slice(0, max);
}

/** The score as the server reported it; when it has none the screen says so rather than computing one. */
export function scoreText(scorePct: number | null): string {
  return scorePct === null ? "Not available" : `${scorePct.toFixed(1)}%`;
}

/** A line explaining a gap between the questions in the test and the ones that can be shown. */
export function reviewedNote(totalQuestions: number, shown: number): string | null {
  if (shown >= totalQuestions) return null;
  const hidden = totalQuestions - shown;
  return `${hidden} ${hidden === 1 ? "question was" : "questions were"} not shown because ${
    hidden === 1 ? "it was" : "they were"
  } incomplete.`;
}

export const FILTER_LABELS: Readonly<Record<ResultFilter, string>> = {
  all: "All",
  wrong: "Wrong",
  skipped: "Skipped",
  flagged: "Flagged",
};

export function filterCount(counts: Breakdown, filter: ResultFilter): number {
  switch (filter) {
    case "wrong":
      return counts.wrong;
    case "skipped":
      return counts.skipped;
    case "flagged":
      return counts.flagged;
    default:
      return counts.total;
  }
}
