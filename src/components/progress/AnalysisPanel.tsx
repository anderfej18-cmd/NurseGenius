import { Link } from "@tanstack/react-router";
import { InsightCard } from "@/components/InsightCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getPerformanceAnalysis } from "@/functions/intelligence.functions";
import { useServerData } from "@/hooks/use-server-data";
import { trendText } from "@/lib/progress-view";

/** What the student's own recorded answers show; every figure is computed from them, none is typed in. */
export function AnalysisPanel() {
  const analysis = useServerData(() => getPerformanceAnalysis({ data: {} }), []);
  const report = analysis.data;

  return (
    <div className="space-y-4">
      {analysis.error && <p className="text-destructive text-sm">{analysis.error}</p>}
      {analysis.loading && !report && (
        <p className="text-sm text-muted-foreground">Looking at your results…</p>
      )}

      {report && !report.sufficientEvidence && (
        <Card className="p-5 space-y-2">
          <h2 className="font-semibold">Your results so far</h2>
          <p className="text-sm">
            You have answered {report.attempts} questions. Answer {report.attemptsNeeded} more and
            finish a test to see patterns in your results.
          </p>
          <Button asChild>
            <Link to="/exam/start">Start practising</Link>
          </Button>
          {report.unverifiedExams > 0 && <UnverifiedNote count={report.unverifiedExams} />}
        </Card>
      )}

      {report?.sufficientEvidence && (
        <>
          <Card className="p-5 space-y-3">
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-bold">{report.accuracy}%</span>
              <span className="text-sm text-muted-foreground">
                correct over {report.attempts} answers
              </span>
            </div>
            {report.recent && report.earlier && (
              <p className="text-sm text-muted-foreground">
                Last 14 days: {report.recent.accuracy}% ({report.recent.attempts} answers). Before
                that: {report.earlier.accuracy}% ({report.earlier.attempts} answers).
              </p>
            )}
            {report.findings.map((finding) => (
              <p key={`${finding.code}-${finding.topic ?? ""}`} className="text-sm">
                {finding.message}
              </p>
            ))}
            <p className="text-xs text-muted-foreground">
              These are patterns in your results, not proof of what caused them.
            </p>
            {report.unverifiedExams > 0 && <UnverifiedNote count={report.unverifiedExams} />}
          </Card>

          {report.weakest.length > 0 && (
            <Card className="p-5 space-y-2">
              <h2 className="font-semibold">Topics to work on</h2>
              {report.weakest.map((topic) => (
                <TopicRow key={topic.topic} topic={topic} />
              ))}
            </Card>
          )}
          {report.strongest.length > 0 && (
            <Card className="p-5 space-y-2">
              <h2 className="font-semibold">Topics going well</h2>
              {report.strongest.map((topic) => (
                <TopicRow key={topic.topic} topic={topic} />
              ))}
            </Card>
          )}
          <Card className="p-5">
            <InsightCard kind="performance" />
          </Card>
        </>
      )}
    </div>
  );
}

function TopicRow({
  topic,
}: {
  topic: { topic: string; attempts: number; accuracy: number; trend: string };
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
      <div>
        <p className="font-medium">{topic.topic}</p>
        <p className="text-muted-foreground">
          {topic.accuracy}% correct · {topic.attempts} answers
        </p>
      </div>
      <Badge variant="secondary">{trendText(topic.trend)}</Badge>
    </div>
  );
}

function UnverifiedNote({ count }: { count: number }) {
  return (
    <p className="text-xs text-muted-foreground">
      {count} of your earlier {count === 1 ? "test has a score" : "tests have scores"} that could
      not be verified. This analysis uses your individual answers, checked against the answer key,
      instead.
    </p>
  );
}
