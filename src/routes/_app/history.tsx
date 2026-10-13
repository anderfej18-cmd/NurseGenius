import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronRight, ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { listExamHistory } from "@/functions/sessions.functions";
import { useServerData } from "@/hooks/use-server-data";
import { HISTORY_MAX } from "@/lib/exam-rules";
import { historyScoreText, historySummaryText, sessionTypeLabel } from "@/lib/history-view";

export const Route = createFileRoute("/_app/history")({
  component: History,
  head: () => ({
    meta: [
      { title: "Test history | NurseGenius" },
      { name: "description", content: "Every test you have finished, with its results." },
    ],
  }),
});

const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

function History() {
  const history = useServerData(() => listExamHistory({ data: {} }), []);
  const { data } = history;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        title="Test history"
        description="Every test you have finished. Open one for the answers, explanations and AI help."
        actions={
          <Button asChild>
            <Link to="/exam/start">Take a test</Link>
          </Button>
        }
      />

      {history.error && (
        <EmptyState
          title="Your history could not be loaded"
          description={history.error}
          action={<Button onClick={() => void history.reload()}>Try again</Button>}
        />
      )}

      {history.loading && !data && !history.error && (
        <div aria-busy="true" className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {data && (
        <div className="flex flex-col gap-4">
          <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
            <p className="measure text-sm text-muted-foreground md:text-base">
              {historySummaryText(data)}
              {data.exams.length >= HISTORY_MAX && ` Showing your latest ${HISTORY_MAX} tests.`}
            </p>
            {data.averageScorePct !== null && (
              <p className="font-display text-4xl font-bold tabular-nums">
                {data.averageScorePct.toFixed(1)}%
                <span className="ml-2 font-sans text-sm font-normal text-muted-foreground">
                  average
                </span>
              </p>
            )}
          </Card>

          {data.exams.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No finished tests yet"
              description="When you finish a test it is listed here, with your score and every answer explained."
              action={
                <Button asChild>
                  <Link to="/exam/start">Take your first test</Link>
                </Button>
              }
            />
          ) : (
            <Card className="overflow-hidden">
              <ul className="divide-y divide-divider">
                {data.exams.map((exam) => (
                  <li key={exam.id}>
                    <Link
                      to="/exam/$examId/results"
                      params={{ examId: exam.id }}
                      className="flex items-center gap-3 px-4 py-4 transition-colors duration-150 hover:bg-sunken focus-ring sm:px-5"
                    >
                      <Badge
                        variant={exam.examType === "RM" ? "rm" : "rn"}
                        className="w-10 shrink-0 justify-center"
                      >
                        {exam.examType}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{exam.category}</p>
                        <p className="text-xs text-muted-foreground">
                          {sessionTypeLabel(exam.sessionType)} ·{" "}
                          {when.format(new Date(exam.completedAt))} · {exam.correctCount ?? "?"} of{" "}
                          {exam.totalQuestions} correct
                          {exam.autoSubmitted ? " · submitted when time ran out" : ""}
                        </p>
                      </div>
                      <Badge
                        variant={exam.scoreVerified ? "secondary" : "outline"}
                        className="shrink-0 tabular-nums"
                      >
                        {historyScoreText(exam)}
                      </Badge>
                      <ChevronRight
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted-foreground"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
