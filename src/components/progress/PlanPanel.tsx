import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { InsightCard } from "@/components/InsightCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { createStudyPlan, getStudyPlan, setExamDate } from "@/functions/engagement.functions";
import { useAuth } from "@/hooks/use-auth";
import { useServerData } from "@/hooks/use-server-data";
import {
  examCountdown,
  planAttentionText,
  planItemLabel,
  planItemReason,
  studyPlanStatusText,
} from "@/lib/progress-view";

type ExamType = "RN" | "RM";

export function PlanPanel() {
  const { profile, refresh } = useAuth();
  const plan = useServerData(() => getStudyPlan({ data: {} }), []);
  const current = plan.data;
  const [daily, setDaily] = useState(30);
  const [days, setDays] = useState(5);
  const [target, setTarget] = useState(80);
  const [examType, setExamType] = useState<ExamType>(
    profile?.exam_preference === "RM" ? "RM" : "RN",
  );
  const [date, setDate] = useState(profile?.exam_date ?? "");
  const [busy, setBusy] = useState(false);

  // Start from the plan's own settings, so updating it changes only what the student edits.
  useEffect(() => {
    if (!current) return;
    setDaily(current.settings.dailyMinutes);
    setDays(current.settings.daysPerWeek);
    setTarget(current.settings.targetScore);
    setExamType(current.examType);
  }, [current]);
  useEffect(() => setDate(profile?.exam_date ?? ""), [profile?.exam_date]);

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await work();
      toast.success(done);
      await Promise.all([plan.reload(), refresh()]);
    } catch (error) {
      toast.error((error as Error).message);
    }
    setBusy(false);
  };

  const saveDate = () => run(() => setExamDate({ data: { examDate: date } }), "Exam date saved.");
  const savePlan = () =>
    run(
      () =>
        createStudyPlan({
          data: { examType, dailyMinutes: daily, daysPerWeek: days, targetScore: target },
        }),
      current ? "Study plan updated." : "Study plan created.",
    );

  const attention = current ? planAttentionText(current.attention) : null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      {plan.error && <p className="text-destructive text-sm">{plan.error}</p>}
      {plan.loading && !current && (
        <p className="text-sm text-muted-foreground">Loading your plan…</p>
      )}

      {current && (
        <Card className="p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Your study plan</h2>
            <Badge variant="secondary">{studyPlanStatusText(current.progress.status)}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {examCountdown(daysUntil(current.plan.examDate))} About {current.plan.questionsPerDay}{" "}
            questions a day, {current.progress.questionsDone} done so far. Questions count as done
            when you answer them in a test; nothing is ticked by hand.
          </p>
          {attention && (
            <div className="rounded-lg border border-warning/50 p-3 text-sm space-y-2">
              <p>{attention}</p>
              <p className="text-xs text-muted-foreground">
                Weeks already begun stay in the plan with what you did in them; only the weeks from
                today are planned again, from your current results.
              </p>
              <Button size="sm" disabled={busy} onClick={() => void savePlan()}>
                Update plan
              </Button>
            </div>
          )}
          {current.progress.weeks.map((week) => {
            const planned = current.plan.weeks[week.index];
            const isCurrent = week.index === current.progress.currentWeek;
            return (
              <details key={week.index} open={isCurrent} className="rounded-lg border p-3">
                <summary className="cursor-pointer space-y-1">
                  <span className="flex justify-between text-sm">
                    <span className={isCurrent ? "font-semibold" : ""}>
                      Week {week.index + 1}
                      {isCurrent && " (this week)"}
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        · {planned.startsOn} to {planned.endsOn}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      {week.done} / {week.planned}
                    </span>
                  </span>
                  <Progress
                    value={week.planned === 0 ? 0 : Math.min(100, (week.done / week.planned) * 100)}
                  />
                </summary>
                <ul className="mt-3 space-y-2">
                  {planned.items.map((item, i) => (
                    <li
                      key={`${item.kind}-${item.topic ?? "mock"}`}
                      className="text-sm flex flex-wrap items-start justify-between gap-2"
                    >
                      <div className="space-y-0.5">
                        <p className="font-medium">
                          {planItemLabel(item)}{" "}
                          <span className="text-muted-foreground font-normal">
                            · {week.items[i]?.done ?? 0} / {item.questions} questions
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {planItemReason(item, current.settings.targetScore)}
                        </p>
                      </div>
                      {planned.endsOn >= today && (
                        <Button asChild size="sm" variant="outline">
                          <Link
                            to="/exam/start"
                            search={{
                              examType: current.examType,
                              ...(item.topic === null ? {} : { topic: item.topic }),
                            }}
                          >
                            Practise
                          </Link>
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
          <InsightCard kind="plan" />
        </Card>
      )}

      <Card className="p-5 space-y-3">
        <h2 className="font-semibold">Exam date</h2>
        <p className="text-sm text-muted-foreground">
          Plans count back from your exam date. It must be in the future.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Exam date" id="plan-exam-date">
            <Input
              id="plan-exam-date"
              type="date"
              min={today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Button
            variant="outline"
            disabled={busy || date === "" || date === profile?.exam_date}
            onClick={() => void saveDate()}
          >
            Save date
          </Button>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="font-semibold">{current ? "Change your plan" : "Make a study plan"}</h2>
        <p className="text-sm text-muted-foreground">
          Your weakest topics are spread across the weeks.
          {!profile?.exam_date && " Set your exam date above first."}
        </p>
        <div className="grid sm:grid-cols-4 gap-3">
          <Field label="Exam" id="plan-exam">
            <select
              id="plan-exam"
              className="h-10 rounded-md border bg-background px-2 text-sm"
              value={examType}
              onChange={(event) => setExamType(event.target.value === "RM" ? "RM" : "RN")}
            >
              <option value="RN">RN</option>
              <option value="RM">RM</option>
            </select>
          </Field>
          <Field label="Minutes a day" id="plan-minutes">
            <Input
              id="plan-minutes"
              type="number"
              min={10}
              max={240}
              value={daily}
              onChange={(e) => setDaily(Number(e.target.value))}
            />
          </Field>
          <Field label="Days a week" id="plan-days">
            <Input
              id="plan-days"
              type="number"
              min={1}
              max={7}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
          </Field>
          <Field label="Target score %" id="plan-target">
            <Input
              id="plan-target"
              type="number"
              min={50}
              max={100}
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
            />
          </Field>
        </div>
        <Button disabled={busy || !profile?.exam_date} onClick={() => void savePlan()}>
          {busy ? "Saving…" : current ? "Update plan" : "Create plan"}
        </Button>
      </Card>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function daysUntil(isoDate: string): number {
  const start = new Date(new Date().toISOString().slice(0, 10)).getTime();
  return Math.round((new Date(isoDate).getTime() - start) / 86_400_000);
}
