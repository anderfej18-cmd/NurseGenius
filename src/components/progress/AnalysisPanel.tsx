import { Link } from "@tanstack/react-router";
import { LoadFailed } from "@/components/app/LoadFailed";
import { Section } from "@/components/app/Section";
import { InsightCard } from "@/components/InsightCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getPerformanceAnalysis } from "@/functions/intelligence.functions";
import { useServerData } from "@/hooks/use-server-data";
import { trendText } from "@/lib/progress-view";

/** What the student's own recorded answers show; every figure is computed from them, none is typed in. */
export function AnalysisPanel() {
  const analysis = useServerData(() => getPerformanceAnalysis({ data: {} }), []);
  const report = analysis.data;

  return (
    <div className="flex flex-col gap-6">
      {analysis.error && !report && <LoadFailed load={analysis} label="Your analysis" />}
      {analysis.loading && !report && !analysis.error && (
        <div aria-busy="true" className="flex flex-col gap-4">
          <span className="sr-only">Looking at your results</span>
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {report && !report.sufficientEvidence && (
        <Section title="Your results so far">
          <p className="text-sm">
            You have answered {report.attempts} questions. Answer {report.attemptsNeeded} more and
            finish a test to see patterns in your results.
          </p>
          <div>
            <Button asChild>
              <Link to="/exam/start">Start practising</Link>
            </Button>
          </div>
          {report.unverifiedExams > 0 && <UnverifiedNote count={report.unverifiedExams} />}
        </Section>
      )}

      {report?.sufficientEvidence && (
        <>
          <Section title="Accuracy">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-sans text-5xl font-semibold leading-none">
                {report.accuracy}%
              </span>
              <span className="text-sm text-muted-foreground">
                correct over {report.attempts} answers
              </span>
            </div>
            {report.recent && report.earlier && (
              <dl className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-sunken p-3">
                  <dt className="text-xs text-muted-foreground">Last 14 days</dt>
                  <dd className="font-sans text-2xl font-semibold">{report.recent.accuracy}%</dd>
                  <dd className="text-xs text-muted-foreground">
                    {report.recent.attempts} answers
                  </dd>
                </div>
                <div className="rounded-lg bg-sunken p-3">
                  <dt className="text-xs text-muted-foreground">Before that</dt>
                  <dd className="font-sans text-2xl font-semibold">{report.earlier.accuracy}%</dd>
                  <dd className="text-xs text-muted-foreground">
                    {report.earlier.attempts} answers
                  </dd>
                </div>
              </dl>
            )}
            {report.findings.length > 0 && (
              <ul className="flex flex-col gap-2 text-sm">
                {report.findings.map((finding) => (
                  <li key={`${finding.code}-${finding.topic ?? ""}`}>{finding.message}</li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              These are patterns in your results, not proof of what caused them.
            </p>
            {report.unverifiedExams > 0 && <UnverifiedNote count={report.unverifiedExams} />}
          </Section>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:items-start">
            {report.weakest.length > 0 && (
              <Section title="Topics to work on">
                <ul className="flex flex-col gap-3">
                  {report.weakest.map((topic) => (
                    <TopicRow key={topic.topic} topic={topic} />
                  ))}
                </ul>
              </Section>
            )}
            {report.strongest.length > 0 && (
              <Section title="Topics going well">
                <ul className="flex flex-col gap-3">
                  {report.strongest.map((topic) => (
                    <TopicRow key={topic.topic} topic={topic} />
                  ))}
                </ul>
              </Section>
            )}
          </div>
          <InsightCard kind="performance" />
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
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sunken p-3 text-sm">
      <div className="min-w-0">
        <p className="font-medium">{topic.topic}</p>
        <p className="text-muted-foreground">
          {topic.accuracy}% correct · {topic.attempts} answers
        </p>
      </div>
      <Badge variant="secondary">{trendText(topic.trend)}</Badge>
    </li>
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
