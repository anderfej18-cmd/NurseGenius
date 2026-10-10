import { z } from "zod";

// What the browser and the server both know about AI explanations (docs/api/ai-insights.md).
// Client-safe: no server code, no secrets.

/** The explanations a student can ask for; each is built from one engine's measured report. */
export const INSIGHT_KINDS = ["recommendation", "readiness", "performance", "plan"] as const;
export type InsightKind = (typeof INSIGHT_KINDS)[number];

/** What the student reads: a short summary, a few points tied to topics they study, and one next step. */
export const narrativeSchema = z
  .object({
    summary: z.string().trim().min(1).max(500),
    points: z
      .array(
        z
          .object({
            topic: z.string().trim().min(1).max(120).nullable(),
            text: z.string().trim().min(1).max(300),
          })
          .strict(),
      )
      .max(5),
    nextAction: z.string().trim().min(1).max(300),
  })
  .strict();
export type Narrative = z.infer<typeof narrativeSchema>;

export type InsightStatus = "ok" | "insufficient_data" | "ai_unavailable" | "rate_limited";

export interface InsightResult {
  readonly kind: InsightKind;
  /** "ai" only when the text came from the model and passed every check. */
  readonly source: "ai" | "computed";
  readonly status: InsightStatus;
  readonly narrative: Narrative;
  /** The measured statements the narrative rests on, shown apart from it. */
  readonly facts: readonly string[];
  /** When the AI text was written; null for a computed summary. */
  readonly generatedAt: string | null;
}
