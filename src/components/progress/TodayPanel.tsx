import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { InsightCard } from "@/components/InsightCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
    <div className="space-y-4">
      {streak.data && (
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Study streak</p>
          <p className="text-3xl font-bold">{streak.data.current} days</p>
          <p className="text-sm text-muted-foreground mt-1">{streakMessage(streak.data)}</p>
        </Card>
      )}

      <ChallengeCard />

      <Card className="p-5 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold">What to study today</h2>
            {plan.data && (
              <p className="text-sm text-muted-foreground">{examCountdown(plan.data.daysToExam)}</p>
            )}
          </div>
          <div>
            <Label htmlFor="minutes">Time you have</Label>
            <Select value={String(minutes)} onValueChange={(v) => setMinutes(Number(v))}>
              <SelectTrigger id="minutes" className="w-32">
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
          </div>
        </div>

        {plan.error && <p className="text-destructive text-sm">{plan.error}</p>}
        {plan.loading && !plan.data && (
          <p className="text-sm text-muted-foreground">Working it out…</p>
        )}
        {plan.data?.limitReached && (
          <p className="text-sm">
            You have used today's question allowance. Come back tomorrow, or upgrade your plan.
          </p>
        )}
        {plan.data?.blocks.map((block) => (
          <div key={`${block.kind}-${block.title}`} className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{block.title}</p>
              <Badge variant="secondary">{block.questions} questions</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{block.reason}</p>
            {!plan.data?.limitReached && (
              <Button asChild size="sm" variant="outline" className="mt-2">
                <Link to="/exam/start" search={planBlockSearch(block)}>
                  Practise this
                </Link>
              </Button>
            )}
          </div>
        ))}
        {plan.data?.notes.map((note) => (
          <p key={note} className="text-xs text-muted-foreground">
            {note}
          </p>
        ))}
        {plan.data && !plan.data.limitReached && (
          <InsightCard kind="recommendation" availableMinutes={minutes} />
        )}
        {plan.data && !plan.data.limitReached && (
          <Button asChild className="bg-hero">
            <Link to="/exam/start">Start practising</Link>
          </Button>
        )}
      </Card>
    </div>
  );
}

function ChallengeCard() {
  const navigate = useNavigate();
  const challenge = useServerData(() => getDailyChallenge({ data: {} }), []);
  const state = challenge.data;
  if (challenge.error)
    return (
      <Card className="p-5">
        <h2 className="font-semibold">Daily challenge</h2>
        <p className="text-sm text-muted-foreground mt-1">{challenge.error}</p>
      </Card>
    );
  if (!state) return null;

  const action = challengeAction(state);
  const go = async () => {
    try {
      if (action.kind === "result" && state.examId) {
        await navigate({ to: "/exam/$examId/results", params: { examId: state.examId } });
        return;
      }
      const started = await startDailyChallenge({ data: {} });
      await navigate({ to: "/exam/$examId", params: { examId: started.examId } });
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <Card className="p-5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Daily challenge</h2>
        <Badge variant="secondary">
          {state.examType} · {state.totalQuestions} questions
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        The same questions all day, once a day. Finishing earns bonus XP.
      </p>
      {state.result && (
        <p className="text-sm font-medium">
          {state.result.correct} of {state.result.total} correct ({state.result.scorePct}%)
        </p>
      )}
      <Button onClick={() => void go()}>{action.label}</Button>
    </Card>
  );
}
