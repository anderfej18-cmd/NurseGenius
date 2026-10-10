import type { InsightKind, Narrative } from "@/lib/ai-insights";

export { INSIGHT_KINDS, narrativeSchema } from "@/lib/ai-insights";
export type { InsightKind, InsightResult, InsightStatus, Narrative } from "@/lib/ai-insights";

/**
 * The measured picture an explanation may rest on. Built by deterministic code from the student's own
 * records; the model sees only these statements, and its answer may use only the topics and numbers in them.
 */
export interface InsightFacts {
  readonly kind: InsightKind;
  /** Each statement is one measured fact, in plain words. */
  readonly facts: readonly string[];
  /** The topic names a point may refer to. */
  readonly topics: readonly string[];
  /** False when there is too little history to say anything personal: no model call is made. */
  readonly sufficientEvidence: boolean;
  /** Shown when there is no AI text; written from the same facts by the same code. */
  readonly fallback: Narrative;
}
