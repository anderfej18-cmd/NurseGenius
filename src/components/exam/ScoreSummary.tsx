import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Breakdown, TopicResult } from "@/lib/results-view";
import { scoreText } from "@/lib/results-view";
import type { ExamType } from "@/lib/exam-type";

/**
 * The top of the results: the score exactly as the server reported it, the breakdown, and what to do
 * next. "Practise next" links open the start screen with the topic already chosen; they only suggest,
 * and the server still picks the questions.
 */
export function ScoreSummary({
  scorePct,
  correctCount,
  totalQuestions,
  counts,
  topics,
  examType,
  note,
}: {
  scorePct: number | null;
  correctCount: number | null;
  totalQuestions: number;
  counts: Breakdown;
  topics: readonly TopicResult[];
  examType: ExamType;
  note: string | null;
}) {
  const facts: Array<[string, number]> = [
    ["Correct", counts.correct],
    ["Wrong", counts.wrong],
    ["Skipped", counts.skipped],
    ["Flagged", counts.flagged],
  ];
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card className="flex flex-col gap-6 p-6 md:p-8">
        <div>
          <h2 className="font-sans text-sm font-medium tracking-normal text-muted-foreground">
            Your score
          </h2>
          <p className="mt-1 font-display text-6xl font-bold tabular-nums md:text-7xl">
            {scoreText(scorePct)}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {correctCount === null
              ? `${totalQuestions} questions. The server has not reported a score for this test.`
              : `${correctCount} of ${totalQuestions} correct. Scored by the server from the answer key.`}
          </p>
          {note && <p className="mt-2 text-sm text-muted-foreground">{note}</p>}
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {facts.map(([label, value]) => (
            <div key={label} className="rounded-md bg-sunken px-3 py-2.5">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="font-mono text-2xl font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="lg">
            <Link to="/exam/start" search={{ examType }}>
              Take another test
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/history">Test history</Link>
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-4 p-6">
        <h2 className="font-sans text-lg font-semibold tracking-normal">Practise next</h2>
        {topics.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You did not miss a question in this test. Try a mixed test across every area to keep it
            up.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {topics.map((row) => (
              <li key={row.topic}>
                <Link
                  to="/exam/start"
                  search={{ examType, topic: row.topic, selection: "adaptive" }}
                  className="flex items-center justify-between gap-3 rounded-md border bg-card px-3.5 py-3 text-sm transition-colors duration-150 hover:bg-sunken focus-ring pointer-coarse:min-h-11"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{row.topic}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {row.wrong + row.skipped} of {row.total} missed
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Button asChild variant="secondary">
          <Link to="/exam/start" search={{ examType, selection: "mistakes" }}>
            Review all my mistakes
          </Link>
        </Button>
      </Card>
    </div>
  );
}
