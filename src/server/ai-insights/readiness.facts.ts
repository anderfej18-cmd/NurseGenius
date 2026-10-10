import type { ReadinessBand, ReadinessReport } from "../intelligence/readiness/readiness";
import type { AssessmentHistory } from "../intelligence/readiness/readiness.service";
import { clip, examFact, fact } from "./facts-text";
import type { InsightFacts, Narrative } from "./insight.types";

const BAND_TEXT: Readonly<Record<ReadinessBand, string>> = {
  not_enough_data: "not enough data yet",
  early: "early in your preparation",
  developing: "developing",
  solid: "solid",
  strong: "strong",
};
const ESTIMATE_NOTE = "This is an estimate, not a prediction of your exam result.";

function movementFact(change: number | null): string | null {
  if (change === null) return null;
  if (change === 0) return "Your estimate is unchanged since your last assessment.";
  return `Your estimate is ${change > 0 ? "up" : "down"} ${Math.abs(change)} points since your last assessment.`;
}

const percent = (value: number): string => `${Math.round(value * 10) / 10}%`;

/** Turns the deterministic readiness report into the facts an explanation may rest on. Pure. */
export function readinessFacts(
  report: ReadinessReport & { readonly history?: AssessmentHistory | null },
): InsightFacts {
  const scored = report.readinessScore !== null;
  const measures: ReadonlyArray<readonly [string, number | null]> = [
    ["Accuracy", report.accuracy],
    ["Mastery", report.mastery],
    ["Speed", report.speed],
    ["Consistency", report.consistency],
  ];

  const lines = [
    report.readinessScore === null
      ? `Not enough answers yet: ${report.attempts} so far, ${report.attemptsToScore} more are needed for an estimate.`
      : `Readiness estimate: ${percent(report.readinessScore)} (${BAND_TEXT[report.band]}), based on ${report.attempts} answers.`,
    scored ? `${Math.round(report.completeness * 100)}% of the measures have data.` : null,
    ...(scored
      ? measures.flatMap(([name, value]) => (value === null ? [] : [`${name}: ${percent(value)}.`]))
      : []),
    ...report.weakTopics.map(
      (t) => `${t.topic}: mastery ${percent(t.mastery)} (${t.level.replace("_", " ")}).`,
    ),
    ...report.recommendations.map((r) => r.message),
    movementFact(report.history?.change ?? null),
    examFact(report.exam.daysToExam),
    ESTIMATE_NOTE,
  ];

  return {
    kind: "readiness",
    facts: lines.filter((line): line is string => line !== null).map(fact),
    topics: report.weakTopics.map((t) => t.topic),
    sufficientEvidence: scored,
    fallback: fallbackFor(report),
  };
}

function fallbackFor(report: ReadinessReport): Narrative {
  if (report.readinessScore === null) {
    return {
      summary: `You have answered ${report.attempts} questions; ${report.attemptsToScore} more are needed before a readiness estimate can be given.`,
      points: [],
      nextAction: "Keep practising across topics to unlock your estimate.",
    };
  }
  const weakest = report.weakTopics.slice(0, 3).map((t) => ({
    topic: t.topic,
    text: `${t.topic} mastery is ${percent(t.mastery)}.`,
  }));
  const advice = report.recommendations
    .slice(0, 2)
    .map((r) => ({ topic: null, text: clip(r.message, 300) }));
  const first = report.weakTopics[0];
  return {
    summary: `Your readiness estimate is ${percent(report.readinessScore)}, ${BAND_TEXT[report.band]}. It is an estimate, not a prediction.`,
    points: [...weakest, ...advice].slice(0, 5),
    nextAction:
      first === undefined
        ? "Keep practising a mix of topics."
        : `Practise ${first.topic}, your weakest topic.`,
  };
}
