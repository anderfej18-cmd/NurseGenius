import type { StudyPlanView } from "../engagement/plans/study-plan.service";
import { planItemLabel, planItemReason } from "@/lib/progress-view";
import { clip, examFact, fact } from "./facts-text";
import type { InsightFacts, Narrative } from "./insight.types";

const MAX_TOPICS = 8;

/** Turns the student's stored study plan, and how far along it they are, into the facts an explanation may rest on. Pure. */
export function planFacts(view: StudyPlanView | null, daysToExam: number | null): InsightFacts {
  if (view === null) {
    return {
      kind: "plan",
      facts: [],
      topics: [],
      sufficientEvidence: false,
      fallback: {
        summary: "You have no study plan yet.",
        points: [],
        nextAction: "Set your exam date and create a plan to see what to study each week.",
      },
    };
  }

  const { settings, plan, progress } = view;
  const week = progress.currentWeek === null ? undefined : plan.weeks[progress.currentWeek];
  const weekProgress =
    progress.currentWeek === null ? undefined : progress.weeks[progress.currentWeek];
  const items = (week?.items ?? []).map((item, i) => {
    const done = weekProgress?.items[i]?.done ?? 0;
    return {
      topic: item.topic,
      line: `This week: ${planItemLabel(item)}, ${done} of ${item.questions} questions done. ${planItemReason(item, settings.targetScore)}`,
    };
  });
  const topics = [
    ...new Set(items.flatMap((item) => (item.topic === null ? [] : [item.topic]))),
  ].slice(0, MAX_TOPICS);

  const lines = [
    examFact(daysToExam),
    `Your plan is ${settings.dailyMinutes} minutes a day, ${settings.daysPerWeek} days a week, with a target of ${settings.targetScore}%.`,
    `You have done ${progress.questionsDone} of the ${progress.plannedToDate} planned questions so far, so you are ${STATUS[progress.status]}.`,
    view.examDateChanged ? "Your exam date has changed since this plan was made." : null,
    ...items.map((item) => item.line),
  ];

  return {
    kind: "plan",
    facts: lines.filter((line): line is string => line !== null).map(fact),
    topics,
    sufficientEvidence: true,
    fallback: fallbackFor(view, items),
  };
}

const STATUS: Readonly<Record<StudyPlanView["progress"]["status"], string>> = {
  not_started: "just starting the plan",
  behind: "behind the plan",
  on_track: "on track with the plan",
  ahead: "ahead of the plan",
  finished: "at the end of the plan",
};

function fallbackFor(
  view: StudyPlanView,
  items: ReadonlyArray<{ topic: string | null; line: string }>,
): Narrative {
  const { progress } = view;
  const first = items.find((item) => item.topic !== null);
  return {
    summary: `You have done ${progress.questionsDone} of the ${progress.plannedToDate} planned questions so far, so you are ${STATUS[progress.status]}.`,
    points: items.slice(0, 5).map((item) => ({
      topic: item.topic,
      text: clip(item.line.replace(/^This week: /, ""), 300),
    })),
    nextAction:
      first?.topic == null
        ? "Open your plan and start this week's practice."
        : `Start with ${first.topic}, the first topic on this week's plan.`,
  };
}
