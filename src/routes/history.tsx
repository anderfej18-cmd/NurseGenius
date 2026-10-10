import { Link, createFileRoute } from "@tanstack/react-router";
import { SignedInPage } from "@/components/SignedInPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HISTORY_MAX } from "@/lib/exam-rules";
import { listExamHistory } from "@/functions/sessions.functions";
import { useServerData } from "@/hooks/use-server-data";
import { historyScoreText, historySummaryText, sessionTypeLabel } from "@/lib/history-view";

export const Route = createFileRoute("/history")({
  component: History,
  head: () => ({
    meta: [
      { title: "Test History — NurseGenius" },
      { name: "description", content: "Every test you have finished, with its results." },
    ],
  }),
});

function History() {
  const history = useServerData(() => listExamHistory({ data: {} }), []);
  const { data } = history;

  return (
    <SignedInPage
      title="Test History"
      description="Every test you have finished. Open one for the answers, rationales and AI help."
    >
      {() => (
        <>
          {history.error && (
            <Card className="p-5 space-y-2">
              <p className="text-destructive text-sm">{history.error}</p>
              <Button size="sm" variant="outline" onClick={() => void history.reload()}>
                Try again
              </Button>
            </Card>
          )}
          {history.loading && !data && <p className="text-muted-foreground text-sm">Loading…</p>}
          {data && (
            <>
              <p className="text-sm text-muted-foreground">
                {historySummaryText(data)}
                {data.exams.length >= HISTORY_MAX && ` Showing your latest ${HISTORY_MAX} tests.`}
              </p>
              {data.exams.length === 0 ? (
                <Card className="p-5 space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Your finished tests will be listed here.
                  </p>
                  <Button asChild size="sm" className="bg-hero">
                    <Link to="/exam/start">Take a test</Link>
                  </Button>
                </Card>
              ) : (
                <Card className="p-2">
                  <ul className="divide-y">
                    {data.exams.map((exam) => (
                      <li key={exam.id}>
                        <Link
                          to="/exam/$examId/results"
                          params={{ examId: exam.id }}
                          className="flex items-center justify-between gap-3 px-3 py-3 rounded hover:bg-accent/40"
                        >
                          <div className="min-w-0">
                            <p className="font-medium truncate">
                              {exam.examType} • {exam.category}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {sessionTypeLabel(exam.sessionType)} ·{" "}
                              {new Date(exam.completedAt).toLocaleString()} ·{" "}
                              {exam.correctCount ?? "?"}/{exam.totalQuestions} correct
                              {exam.autoSubmitted ? " · submitted when time ran out" : ""}
                            </p>
                          </div>
                          <Badge variant={exam.scoreVerified ? "secondary" : "outline"}>
                            {historyScoreText(exam)}
                          </Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </SignedInPage>
  );
}
