import type { PerformanceReport } from "../intelligence/performance/performance";
import { clip, fact } from "./facts-text";
import type { InsightFacts, Narrative } from "./insight.types";

const CAUTION = "These are patterns in your results, not proof of a cause.";

/** Turns the deterministic performance analysis into the facts an explanation may rest on. Pure. */
export function performanceFacts(report: PerformanceReport): InsightFacts {
  const topics = [...new Set([...report.weakest, ...report.strongest].map((t) => t.topic))];
  const lines = report.sufficientEvidence
    ? [
        `Overall: ${report.accuracy}% correct over ${report.attempts} answers.`,
        ...report.findings.map((finding) => finding.message),
        CAUTION,
      ]
    : [
        `Not enough answers yet: ${report.attempts} so far, ${report.attemptsNeeded} more are needed to find patterns.`,
        ...report.findings.map((finding) => finding.message),
      ];
  return {
    kind: "performance",
    facts: lines.map(fact),
    topics,
    sufficientEvidence: report.sufficientEvidence,
    fallback: fallbackFor(report),
  };
}

function fallbackFor(report: PerformanceReport): Narrative {
  if (!report.sufficientEvidence) {
    return {
      summary: `You have answered ${report.attempts} questions; ${report.attemptsNeeded} more are needed before patterns can be found.`,
      points: [],
      nextAction: "Keep practising across topics to unlock your analysis.",
    };
  }
  const weakest = report.weakest[0];
  const points = report.findings
    .filter((finding) => finding.code !== "unverified_scores")
    .slice(0, 5)
    .map((finding) => ({ topic: finding.topic, text: clip(finding.message, 300) }));
  return {
    summary: `You answered ${report.accuracy}% of ${report.attempts} questions correctly. These are patterns in your results, not proof of a cause.`,
    points,
    nextAction:
      weakest === undefined
        ? "Keep practising a mix of topics."
        : `Practise ${weakest.topic}, your weakest topic.`,
  };
}
