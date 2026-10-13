import { Link, useNavigate } from "@tanstack/react-router";
import { Flame } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { LoadFailed } from "@/components/app/LoadFailed";
import { Section } from "@/components/app/Section";
import { InsightCard } from "@/components/InsightCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getDailyChallenge,
  getStudyStreak,
  startDailyChallenge,
} from "@/functions/engagement.functions";
import { getDailyRecommendation } from "@/functions/intelligence.functions";
import { useServerData } from "@/hooks/use-server-data";
import {
  challengeAction,
  examCountdown,
  planBlockSearch,
  streakMessage,
} from "@/lib/progress-view";

const MINUTES = [15, 30, 60, 90] as const;

export function TodayPanel() {
  const [minutes, setMinutes] = useState<number>(30);
  const plan = useServerData(
    () => getDailyRecommendation({ data: { availableMinutes: minutes } }),
    [minutes],
  );
  const streak = useServerData(() => getStudyStreak({ data: {} }), []);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Section title="Study streak">
          {streak.data && (
            <div className="flex flex-col gap-1">
              <p className="flex items-center gap-2 font-sans text-3xl font-semibold">
                <Flame aria-hidden="true" className="size-7 text-warning" />
                {streak.data.current} {streak.data.current === 1 ? "day" : "days"}
              </p>
              <p className="text-sm text-muted-foreground">{streakMessage(streak.data)}</p>
            </div>
          )}
          {streak.error && !streak.data && <LoadFailed load={streak} label="Your streak" />}
          {streak.loading && !streak.data && !streak.error && <Skeleton className="h-16 w-full" />}
        </Section>
        <ChallengeCard />
      </div>

      <Section
        title="What to study today"
        description={plan.data ? examCountdown(plan.data.daysToExam) : undefined}
        actions={
          <Field label="Time you have" className="w-40">
            {(control) => (
              <Select value={String(minutes)} onValueChange={(v) => setMinutes(Number(v))}>
                <SelectTrigger {...control}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MINUTES.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {m} minutes
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
        }
      >
        {plan.error && !plan.data && <LoadFailed load={plan} label="Today's plan" />}
        {plan.loading && !plan.data && !plan.error && (
          <div aria-busy="true" className="flex flex-col gap-3">
            <span className="sr-only">Working out your day</span>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}
        {plan.data?.limitReached && (
          <p className="text-sm">
            You have used today's question allowance. Come back tomorrow, or{" "}
            <Link
              to="/payments"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              upgrade your plan
            </Link>
            .
          </p>
        )}
        {plan.data && plan.data.blocks.length > 0 && (
          <ol className="flex flex-col gap-3">
            {plan.data.blocks.map((block, index) => (
              <li
                key={`${block.kind}-${block.title}`}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-raised p-4"
              >
                <div className="flex min-w-0 gap-3">
                  <span
                    aria-hidden="true"
                    className="flex size-7 shrink-0 items-center justify-center rounded-md bg-mark text-sm font-semibold text-mark-foreground"
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{block.title}</p>
                      <Badge variant="secondary">{block.questions} questions</Badge>
                    </div>
                    <p className="measure mt-1 text-sm text-muted-foreground">{block.reason}</p>
                  </div>
                </div>
                {!plan.data?.limitReached && (
                  <Button asChild size="sm" variant="outline">
                    <Link to="/exam/start" search={planBlockSearch(block)}>
                      Practise this
                    </Link>
                  </Button>
                )}
              </li>
            ))}
          </ol>
        )}
        {plan.data?.blocks.length === 0 && !plan.data.limitReached && (
          <p className="text-sm text-muted-foreground">
            Nothing is due. Start any practice you like.
          </p>
        )}
        {plan.data?.notes.map((note) => (
          <p key={note} className="text-xs text-muted-foreground">
            {note}
          </p>
        ))}
        {plan.data && !plan.data.limitReached && (
          <InsightCard kind="recommendation" availableMinutes={minutes} />
        )}
        {plan.data && !plan.data.limitReached && (
          <div>
            <Button asChild>
              <Link to="/exam/start">Start practising</Link>
            </Button>
          </div>
        )}
      </Section>
    </div>
  );
}

function ChallengeCard() {
  const navigate = useNavigate();
  const challenge = useServerData(() => getDailyChallenge({ data: {} }), []);
  const [busy, setBusy] = useState(false);
  const state = challenge.data;

  if (challenge.error && !state)
    return (
      <Section title="Daily challenge">
        <LoadFailed load={challenge} label="The daily challenge" />
      </Section>
    );
  if (!state)
    return (
      <Section title="Daily challenge">
        <Skeleton className="h-16 w-full" />
      </Section>
    );

  const action = challengeAction(state);
  const go = async () => {
    setBusy(true);
    try {
      if (action.kind === "result" && state.examId) {
        await navigate({ to: "/exam/$examId/results", params: { examId: state.examId } });
        return;
      }
      const started = await startDailyChallenge({ data: {} });
      await navigate({ to: "/exam/$examId", params: { examId: started.examId } });
    } catch (error) {
      toast.error((error as Error).message);
      setBusy(false);
    }
  };

  return (
    <Section
      title="Daily challenge"
      description="The same questions all day, once a day. Finishing earns bonus XP."
      actions={
        <Badge variant="secondary">
          {state.examType} · {state.totalQuestions} questions
        </Badge>
      }
    >
      {state.result && (
        <p className="text-sm font-medium">
          {state.result.correct} of {state.result.total} correct ({state.result.scorePct}%)
        </p>
      )}
      <div>
        <Button loading={busy} onClick={() => void go()}>
          {action.label}
        </Button>
      </div>
    </Section>
  );
}
