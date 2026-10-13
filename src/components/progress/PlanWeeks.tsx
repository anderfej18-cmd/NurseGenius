import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { getStudyPlan } from "@/functions/engagement.functions";
import { planItemLabel, planItemReason } from "@/lib/progress-view";

type StudyPlan = NonNullable<Awaited<ReturnType<typeof getStudyPlan>>>;

/**
 * The plan week by week: how much of each week's questions are done, and for each topic in it a link
 * that starts a test on that topic while the week is still open. The current week starts open.
 */
export function PlanWeeks({ plan: current, today }: { plan: StudyPlan; today: string }) {
  return (
    <div className="flex flex-col gap-3">
      {current.progress.weeks.map((week) => {
        const planned = current.plan.weeks[week.index];
        const isCurrent = week.index === current.progress.currentWeek;
        return (
          <details
            key={week.index}
            open={isCurrent}
            className="group rounded-lg border bg-raised p-4"
          >
            <summary className="flex cursor-pointer flex-col gap-2 rounded-sm focus-ring">
              <span className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className={isCurrent ? "font-semibold" : "font-medium"}>
                  Week {week.index + 1}
                  {isCurrent && " (this week)"}
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    · {planned.startsOn} to {planned.endsOn}
                  </span>
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {week.done} / {week.planned}
                </span>
              </span>
              <Progress
                aria-label={`Week ${week.index + 1}: ${week.done} of ${week.planned} questions done`}
                value={week.planned === 0 ? 0 : Math.min(100, (week.done / week.planned) * 100)}
              />
            </summary>
            <ul className="mt-4 flex flex-col gap-3">
              {planned.items.map((item, i) => (
                <li
                  key={`${item.kind}-${item.topic ?? "mock"}`}
                  className="flex flex-wrap items-start justify-between gap-3 text-sm"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="font-medium">
                      {planItemLabel(item)}{" "}
                      <span className="font-normal text-muted-foreground">
                        · {week.items[i]?.done ?? 0} / {item.questions} questions
                      </span>
                    </p>
                    <p className="measure text-xs text-muted-foreground">
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
    </div>
  );
}
