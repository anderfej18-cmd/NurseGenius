import type { DailyPlan, PlanBlock } from "../intelligence/recommendation/recommendation.types";
import { clip, examFact, fact } from "./facts-text";
import type { InsightFacts, Narrative } from "./insight.types";

const topicOf = (block: PlanBlock): string | null =>
  block.kind === "topic_practice" ? block.topic : null;

/** Turns the day's deterministic plan into the facts an explanation may rest on. Pure. */
export function recommendationFacts(plan: DailyPlan): InsightFacts {
  const personal = !plan.limitReached && plan.blocks.some((b) => b.kind !== "mixed_practice");
  const topics = [...new Set(plan.blocks.flatMap((b) => topicOf(b) ?? []))];

  const lines = [
    `You have ${plan.availableMinutes} minutes to study today.`,
    examFact(plan.daysToExam),
    plan.blocks.length > 0
      ? `The plan has ${plan.totalQuestions} questions, about ${plan.estimatedMinutes} minutes.`
      : null,
    ...plan.blocks.map((b) => `${b.title}: ${b.questions} questions. ${b.reason}`),
    ...plan.notes,
  ];

  return {
    kind: "recommendation",
    facts: lines.filter((line): line is string => line !== null).map(fact),
    topics,
    sufficientEvidence: personal,
    fallback: fallbackFor(plan, personal),
  };
}

function fallbackFor(plan: DailyPlan, personal: boolean): Narrative {
  if (plan.limitReached) {
    return {
      summary: clip(
        plan.notes[0] ?? "Today's question limit has been reached; come back tomorrow.",
        500,
      ),
      points: [],
      nextAction: "Come back tomorrow for the next plan.",
    };
  }
  const first = plan.blocks[0];
  if (!personal || first === undefined) {
    return {
      summary:
        "You have no practice history yet, so this is a starting plan rather than a personal one.",
      points: [],
      nextAction: "Start with a mixed practice session to build your baseline.",
    };
  }
  return {
    summary: `Today's plan has ${plan.totalQuestions} questions, about ${plan.estimatedMinutes} minutes.`,
    points: plan.blocks.slice(0, 5).map((b) => ({ topic: topicOf(b), text: clip(b.reason, 300) })),
    nextAction: clip(`Start with ${first.title.toLowerCase()}: ${first.questions} questions.`, 300),
  };
}
