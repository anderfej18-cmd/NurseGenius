import type { InsightFacts, Narrative } from "./insight.types";

export type GroundingResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: "unknown_topic" | "ungrounded_number" | "certainty_claim" | "link";
    };

const NUMBER = /\d+(?:\.\d+)?/g;
const TOLERANCE = 0.05;
// A prediction or a promise about the exam result: the readiness figure is an estimate, never a forecast.
const CERTAINTY =
  /\bguarantee[sd]?\b|\bwill (?:\w+ )?(?:pass|fail)\b|\b(?:going to|sure to|certain to|bound to) (?:pass|fail)\b/i;
const LINK = /https?:\/\/|www\./i;

const numbersIn = (text: string): number[] => (text.match(NUMBER) ?? []).map(Number);
const normalise = (topic: string): string => topic.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Checks that AI-written text rests only on the measured facts: it may name only topics the facts name,
 * use only numbers the facts contain, make no promise about the exam result, and carry no links.
 * Pure. A narrative that fails is discarded and the computed summary is shown instead.
 */
export function checkGrounding(narrative: Narrative, facts: InsightFacts): GroundingResult {
  const texts = [
    narrative.summary,
    narrative.nextAction,
    ...narrative.points.map((point) => point.text),
  ];

  if (texts.some((text) => LINK.test(text))) return { ok: false, reason: "link" };
  if (texts.some((text) => CERTAINTY.test(text))) return { ok: false, reason: "certainty_claim" };

  const topics = new Set(facts.topics.map(normalise));
  for (const point of narrative.points) {
    if (point.topic !== null && !topics.has(normalise(point.topic))) {
      return { ok: false, reason: "unknown_topic" };
    }
  }

  const known = facts.facts.flatMap(numbersIn);
  const grounded = (value: number): boolean => known.some((n) => Math.abs(n - value) <= TOLERANCE);
  if (texts.some((text) => !numbersIn(text).every(grounded))) {
    return { ok: false, reason: "ungrounded_number" };
  }
  return { ok: true };
}
