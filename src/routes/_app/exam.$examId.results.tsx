import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/app/PageHeader";
import { ResultQuestion, type ReviewItem } from "@/components/exam/ResultQuestion";
import { ScoreSummary } from "@/components/exam/ScoreSummary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { getExamResults } from "@/functions/sessions.functions";
import { useServerData } from "@/hooks/use-server-data";
import {
  FILTER_LABELS,
  breakdown,
  filterCount,
  filterItems,
  reviewedNote,
  topicsToPractise,
  type ResultFilter,
} from "@/lib/results-view";
import { isCompleteQuestion } from "@/lib/questions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/exam/$examId/results")({
  component: Results,
  head: () => ({
    meta: [
      { title: "Test results | NurseGenius" },
      {
        name: "description",
        content: "Review your nursing practice score, answers, and explanations.",
      },
      { property: "og:title", content: "Test results | NurseGenius" },
      {
        property: "og:description",
        content: "Review your nursing practice score and answer explanations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const FILTERS: readonly ResultFilter[] = ["all", "wrong", "skipped", "flagged"];

function Results() {
  const { examId } = Route.useParams();
  const [filter, setFilter] = useState<ResultFilter>("all");
  // Scores, correctness and rationale are computed and released by the server after submission.
  const results = useServerData(() => getExamResults({ data: { examId } }), [examId]);

  const items = useMemo(
    () =>
      ((results.data?.items ?? []) as unknown as ReviewItem[]).filter((item) =>
        isCompleteQuestion(item.questions),
      ),
    [results.data],
  );
  const counts = useMemo(() => breakdown(items), [items]);
  const shown = useMemo(() => filterItems(items, filter), [items, filter]);
  const topics = useMemo(() => topicsToPractise(items), [items]);

  if (results.error)
    return (
      <div className="mx-auto w-full max-w-3xl">
        <PageHeader title="Test results" />
        <EmptyState
          title="These results could not be loaded"
          description={results.error}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => void results.reload()}>Try again</Button>
              <Button asChild variant="outline">
                <Link to="/history">Test history</Link>
              </Button>
            </div>
          }
        />
      </div>
    );

  if (!results.data)
    return (
      <div className="mx-auto w-full max-w-3xl" aria-busy="true">
        <PageHeader title="Test results" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );

  const { exam } = results.data;
  const examType = exam.exam_type === "RM" ? "RM" : "RN";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <PageHeader
        title="Test results"
        description={`${examType === "RM" ? "Registered Midwife" : "Registered Nurse"} practice test, with the correct answers and explanations.`}
        actions={<Badge variant={examType === "RM" ? "rm" : "rn"}>{examType}</Badge>}
      />

      <ScoreSummary
        scorePct={exam.score_pct}
        correctCount={exam.correct_count}
        totalQuestions={exam.total_questions}
        counts={counts}
        topics={topics}
        examType={examType}
        note={reviewedNote(exam.total_questions, items.length)}
      />

      <section aria-labelledby="review-heading" className="flex flex-col gap-4">
        <div className="sticky top-14 z-20 -mx-1 flex flex-wrap items-center justify-between gap-3 bg-background px-1 py-3">
          <h2 id="review-heading" className="font-sans text-xl font-semibold tracking-normal">
            Review every question
          </h2>
          <div
            role="group"
            aria-label="Show questions"
            className="inline-flex gap-1 rounded-md bg-muted p-1"
          >
            {FILTERS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={filter === option}
                onClick={() => setFilter(option)}
                className={cn(
                  "h-8 rounded-sm px-3 text-sm font-medium focus-ring pointer-coarse:h-10",
                  filter === option
                    ? "bg-raised text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {FILTER_LABELS[option]}{" "}
                <span className="tabular-nums">({filterCount(counts, option)})</span>
              </button>
            ))}
          </div>
        </div>

        {items.length === 0 ? (
          <EmptyState
            title="There are no questions to review"
            description="This test has no complete questions to show."
          />
        ) : shown.length === 0 ? (
          <EmptyState
            title={`No ${FILTER_LABELS[filter].toLowerCase()} questions`}
            description="Nothing in this test matches that filter."
            action={
              <Button variant="outline" onClick={() => setFilter("all")}>
                Show all questions
              </Button>
            }
          />
        ) : (
          <ol className="flex flex-col gap-4">
            {shown.map((item) => (
              <li key={item.questions.id}>
                <ResultQuestion
                  item={item}
                  number={items.indexOf(item) + 1}
                  examId={examId}
                  examType={examType}
                />
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
