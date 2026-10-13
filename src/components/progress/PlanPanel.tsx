import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PlanWeeks } from "@/components/progress/PlanWeeks";
import { LoadFailed } from "@/components/app/LoadFailed";
import { Section } from "@/components/app/Section";
import { InsightCard } from "@/components/InsightCard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { createStudyPlan, getStudyPlan, setExamDate } from "@/functions/engagement.functions";
import { useAuth } from "@/hooks/use-auth";
import { useServerData } from "@/hooks/use-server-data";
import { PLAN_LIMITS, validatePlanSettings, type PlanErrors } from "@/lib/plan-form";
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
  const [busy, setBusy] = useState<"date" | "plan" | null>(null);
  const [errors, setErrors] = useState<PlanErrors>({});
  const fields = {
    dailyMinutes: useRef<HTMLInputElement>(null),
    daysPerWeek: useRef<HTMLInputElement>(null),
    targetScore: useRef<HTMLInputElement>(null),
  };

  // Start from the plan's own settings, so updating it changes only what the student edits.
  useEffect(() => {
    if (!current) return;
    setDaily(current.settings.dailyMinutes);
    setDays(current.settings.daysPerWeek);
    setTarget(current.settings.targetScore);
    setExamType(current.examType);
  }, [current]);
  useEffect(() => setDate(profile?.exam_date ?? ""), [profile?.exam_date]);

  const run = async (kind: "date" | "plan", work: () => Promise<unknown>, done: string) => {
    setBusy(kind);
    try {
      await work();
      toast.success(done);
      await Promise.all([plan.reload(), refresh()]);
    } catch (error) {
      toast.error((error as Error).message);
    }
    setBusy(null);
  };

  const saveDate = () =>
    run("date", () => setExamDate({ data: { examDate: date } }), "Exam date saved.");
  const savePlan = () => {
    const found = validatePlanSettings({
      dailyMinutes: daily,
      daysPerWeek: days,
      targetScore: target,
    });
    setErrors(found);
    const first = (Object.keys(found) as (keyof typeof fields)[])[0];
    if (first) {
      fields[first].current?.focus();
      return;
    }
    void run(
      "plan",
      () =>
        createStudyPlan({
          data: { examType, dailyMinutes: daily, daysPerWeek: days, targetScore: target },
        }),
      current ? "Study plan updated." : "Study plan created.",
    );
  };

  const attention = current ? planAttentionText(current.attention) : null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-6">
      {plan.error && !current && <LoadFailed load={plan} label="Your plan" />}
      {plan.loading && !current && !plan.error && (
        <div aria-busy="true">
          <span className="sr-only">Loading your plan</span>
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {current && (
        <Section
          title="Your study plan"
          description={`${examCountdown(daysUntil(current.plan.examDate))} About ${current.plan.questionsPerDay} questions a day, ${current.progress.questionsDone} done so far. Questions count as done when you answer them in a test; nothing is ticked by hand.`}
          actions={
            <Badge variant="secondary">{studyPlanStatusText(current.progress.status)}</Badge>
          }
        >
          {attention && (
            <Alert variant="warning">
              <AlertDescription>{attention}</AlertDescription>
              <AlertDescription className="text-xs">
                Weeks already begun stay in the plan with what you did in them; only the weeks from
                today are planned again, from your current results.
              </AlertDescription>
              <div className="pt-1">
                <Button size="sm" loading={busy === "plan"} onClick={savePlan}>
                  Update plan
                </Button>
              </div>
            </Alert>
          )}
          <PlanWeeks plan={current} today={today} />
          <InsightCard kind="plan" />
        </Section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
        <Section
          title="Exam date"
          description="Plans count back from your exam date. It must be in the future."
        >
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Exam date" className="min-w-0 flex-1">
              {(control) => (
                <Input
                  {...control}
                  type="date"
                  min={today}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              )}
            </Field>
            <Button
              variant="outline"
              loading={busy === "date"}
              disabled={date === "" || date === profile?.exam_date}
              onClick={() => void saveDate()}
            >
              Save date
            </Button>
          </div>
        </Section>

        <Section
          title={current ? "Change your plan" : "Make a study plan"}
          description={`Your weakest topics are spread across the weeks.${!profile?.exam_date ? " Set your exam date first." : ""}`}
        >
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              savePlan();
            }}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Exam">
                {(control) => (
                  <Select
                    value={examType}
                    onValueChange={(v) => setExamType(v === "RM" ? "RM" : "RN")}
                  >
                    <SelectTrigger {...control}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RN">RN, Registered Nurse</SelectItem>
                      <SelectItem value="RM">RM, Registered Midwife</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </Field>
              <Field
                label="Minutes a day"
                hint={`${PLAN_LIMITS.dailyMinutes.min} to ${PLAN_LIMITS.dailyMinutes.max}`}
                error={errors.dailyMinutes}
              >
                {(control) => (
                  <Input
                    {...control}
                    ref={fields.dailyMinutes}
                    type="number"
                    inputMode="numeric"
                    value={Number.isNaN(daily) ? "" : daily}
                    onChange={(e) => setDaily(e.target.valueAsNumber)}
                  />
                )}
              </Field>
              <Field
                label="Days a week"
                hint={`${PLAN_LIMITS.daysPerWeek.min} to ${PLAN_LIMITS.daysPerWeek.max}`}
                error={errors.daysPerWeek}
              >
                {(control) => (
                  <Input
                    {...control}
                    ref={fields.daysPerWeek}
                    type="number"
                    inputMode="numeric"
                    value={Number.isNaN(days) ? "" : days}
                    onChange={(e) => setDays(e.target.valueAsNumber)}
                  />
                )}
              </Field>
              <Field
                label="Target score (%)"
                hint={`${PLAN_LIMITS.targetScore.min} to ${PLAN_LIMITS.targetScore.max}`}
                error={errors.targetScore}
              >
                {(control) => (
                  <Input
                    {...control}
                    ref={fields.targetScore}
                    type="number"
                    inputMode="numeric"
                    value={Number.isNaN(target) ? "" : target}
                    onChange={(e) => setTarget(e.target.valueAsNumber)}
                  />
                )}
              </Field>
            </div>
            <div>
              <Button type="submit" loading={busy === "plan"} disabled={!profile?.exam_date}>
                {current ? "Update plan" : "Create plan"}
              </Button>
            </div>
          </form>
        </Section>
      </div>
    </div>
  );
}

function daysUntil(isoDate: string): number {
  const start = new Date(new Date().toISOString().slice(0, 10)).getTime();
  return Math.round((new Date(isoDate).getTime() - start) / 86_400_000);
}
