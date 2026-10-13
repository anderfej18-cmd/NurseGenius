import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronRight, ClipboardList, Flame } from "lucide-react";
import { LoadFailed } from "@/components/app/LoadFailed";
import { Section } from "@/components/app/Section";
import { StatTile } from "@/components/app/StatTile";
import { MeterList } from "@/components/charts/MeterList";
import { TrendChart } from "@/components/charts/TrendChart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { getGamificationSummary, getStudyStreak } from "@/functions/engagement.functions";
import {
  getDailyRecommendation,
  getExamReadiness,
  getTopicMastery,
} from "@/functions/intelligence.functions";
import { listExamHistory } from "@/functions/sessions.functions";
import { useServerData } from "@/hooks/use-server-data";
import {
  allowanceCaption,
  allowanceHeadline,
  scoreTrend,
  shortDate,
  streakHeadline,
  trendAxisLabels,
} from "@/lib/dashboard-view";
import {
  examCountdown,
  masteryLevelText,
  planBlockSearch,
  readinessBandText,
  strongestAndWeakest,
} from "@/lib/progress-view";

/** What to do today: the first block of the server's plan, with a link that prefills the test. */
export function TodayCard() {
  const plan = useServerData(() => getDailyRecommendation({ data: { availableMinutes: 30 } }), []);
  const first = plan.data?.blocks[0];
  return (
    <Section
      title="Today"
      description={plan.data ? examCountdown(plan.data.daysToExam) : undefined}
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link to="/today">
            Full plan <ArrowRight />
          </Link>
        </Button>
      }
    >
      {plan.error && !plan.data && <LoadFailed load={plan} label="Today's plan" />}
      {plan.loading && !plan.data && !plan.error && <Skeleton className="h-20 w-full" />}
      {plan.data?.limitReached && (
        <p className="text-sm">
          You have used today's question allowance. Come back tomorrow, or upgrade your plan.
        </p>
      )}
      {plan.data && !plan.data.limitReached && first && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{first.title}</p>
              <Badge variant="secondary">{first.questions} questions</Badge>
            </div>
            <p className="measure mt-1 text-sm text-muted-foreground">{first.reason}</p>
          </div>
          <Button asChild>
            <Link to="/exam/start" search={planBlockSearch(first)}>
              Practise this
            </Link>
          </Button>
        </div>
      )}
      {plan.data && !plan.data.limitReached && !first && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Nothing is due. Start any practice you like.
          </p>
          <Button asChild>
            <Link to="/exam/start">Start practising</Link>
          </Button>
        </div>
      )}
    </Section>
  );
}

export function AllowanceTile({ used, limit }: { used: number; limit: number | null }) {
  return (
    <StatTile
      label="Questions today"
      value={allowanceHeadline(used, limit)}
      note={allowanceCaption(used, limit)}
    >
      {limit !== null && (
        <Progress
          value={(used / limit) * 100}
          aria-label={`${used} of ${limit} questions used today`}
          className="mt-2"
        />
      )}
    </StatTile>
  );
}

export function StreakTile() {
  const streak = useServerData(() => getStudyStreak({ data: {} }), []);
  return (
    <StatTile
      label="Study streak"
      value={
        streak.data ? (
          <span className="inline-flex items-center gap-2">
            <Flame aria-hidden="true" className="size-6 text-warning" />
            {streakHeadline(streak.data.current)}
          </span>
        ) : streak.error ? (
          "Unavailable"
        ) : (
          <Skeleton className="h-8 w-24" />
        )
      }
      note={
        streak.data
          ? streak.data.studiedToday
            ? "Kept for today."
            : `Answer ${streak.data.minQuestionsPerDay} questions today to keep it.`
          : streak.error
            ? streak.error
            : undefined
      }
    />
  );
}

export function ReadinessTile({ examType }: { examType: "RN" | "RM" }) {
  const readiness = useServerData(() => getExamReadiness({ data: { examType } }), [examType]);
  const report = readiness.data;
  return (
    <StatTile
      label={`${examType} readiness`}
      value={
        report ? (
          report.readinessScore === null ? (
            "Not yet"
          ) : (
            Math.round(report.readinessScore)
          )
        ) : readiness.error ? (
          "Unavailable"
        ) : (
          <Skeleton className="h-8 w-16" />
        )
      }
      note={
        report ? (
          report.readinessScore === null ? (
            `Answer ${report.attemptsToScore} more questions to get a score.`
          ) : (
            <>
              {readinessBandText(report.band)}.{" "}
              <Link
                to="/mastery"
                className="font-medium text-primary underline-offset-4 hover:underline focus-ring rounded-sm"
              >
                See how it is worked out
              </Link>
            </>
          )
        ) : (
          readiness.error
        )
      }
    />
  );
}

export function LevelTile() {
  const summary = useServerData(() => getGamificationSummary({ data: {} }), []);
  const data = summary.data;
  return (
    <StatTile
      label="Level"
      value={
        data ? data.level.level : summary.error ? "Unavailable" : <Skeleton className="h-8 w-12" />
      }
      note={
        data
          ? data.level.xpForNextLevel === null
            ? `${data.totalXp} XP, the top level.`
            : `${data.level.xpIntoLevel} of ${data.level.xpForNextLevel} XP to the next level.`
          : summary.error
      }
    >
      {data && (
        <Progress
          value={data.level.progress * 100}
          aria-label="Progress to the next level"
          className="mt-2"
        />
      )}
    </StatTile>
  );
}

/** Verified scores over the last tests, and the tests themselves. */
export function RecentTests({ recent }: { recent: number }) {
  const history = useServerData(() => listExamHistory({ data: { limit: recent } }), [recent]);
  const exams = history.data?.exams ?? [];
  const trend = scoreTrend(exams);
  const axis = trendAxisLabels(exams);
  const average = history.data?.averageScorePct ?? null;
  return (
    <Section
      title="Recent scores"
      description={
        history.data && average !== null
          ? `Average ${average.toFixed(1)}% over your last ${history.data.verifiedCount} verified ${history.data.verifiedCount === 1 ? "test" : "tests"}.`
          : undefined
      }
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link to="/history">
            All finished tests <ArrowRight />
          </Link>
        </Button>
      }
    >
      {history.error && !history.data && <LoadFailed load={history} label="Your tests" />}
      {history.loading && !history.data && !history.error && <Skeleton className="h-48 w-full" />}
      {history.data && exams.length === 0 && (
        <EmptyState
          icon={ClipboardList}
          title="No finished tests yet"
          description="Your scores appear here after your first test."
          action={
            <Button asChild>
              <Link to="/exam/start">Take your first test</Link>
            </Button>
          }
        />
      )}
      {trend.length >= 2 && (
        <TrendChart
          points={trend}
          title="Score by test, verified tests only"
          firstAxisLabel={axis.first}
          lastAxisLabel={axis.last}
        />
      )}
      {trend.length === 1 && (
        <p className="text-sm text-muted-foreground">
          A chart appears after your second verified test.
        </p>
      )}
      {exams.length > 0 && (
        <ul className="-mx-2 divide-y divide-divider">
          {exams.slice(0, 5).map((exam) => (
            <li key={exam.id}>
              <Link
                to="/exam/$examId/results"
                params={{ examId: exam.id }}
                className="flex items-center gap-3 rounded-md px-2 py-3 transition-colors duration-150 hover:bg-sunken focus-ring"
              >
                <Badge
                  variant={exam.examType === "RM" ? "rm" : "rn"}
                  className="w-10 shrink-0 justify-center"
                >
                  {exam.examType}
                </Badge>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{exam.category}</span>
                  <span className="block text-xs text-muted-foreground">
                    {shortDate(exam.completedAt)}
                  </span>
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  {exam.scoreVerified ? `${(exam.scorePct ?? 0).toFixed(1)}%` : "Unverified"}
                </span>
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** Where to spend time: the weakest topics by the server's mastery score, then the strongest. */
export function TopicFocus() {
  const mastery = useServerData(() => getTopicMastery({ data: {} }), []);
  const { strongest, weakest } = strongestAndWeakest(mastery.data?.topics ?? [], 4);
  const row = (topic: { topic: string; score: number; level: string; attempts: number }) => ({
    key: topic.topic,
    label: topic.topic,
    value: topic.score,
    valueText: String(Math.round(topic.score)),
    status: masteryLevelText(topic.level),
    note: `${topic.attempts} answered`,
  });
  return (
    <Section
      title="Where to focus"
      description="Mastery by topic, from 0 to 100. A few answers do not move a topic far."
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link to="/mastery">
            Mastery <ArrowRight />
          </Link>
        </Button>
      }
    >
      {mastery.error && !mastery.data && <LoadFailed load={mastery} label="Your topics" />}
      {mastery.loading && !mastery.data && !mastery.error && <Skeleton className="h-40 w-full" />}
      {mastery.data && weakest.length === 0 && strongest.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Finish a test to see where you are strong and where to work.
        </p>
      )}
      {weakest.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">Needs work</h3>
          <MeterList label="Topics that need work" rows={weakest.map(row)} />
        </div>
      )}
      {strongest.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">Going well</h3>
          <MeterList label="Topics going well" rows={strongest.map(row)} />
        </div>
      )}
    </Section>
  );
}
