/** Limits and versions for the AI explanations of measured facts (ADR-0011, docs/formulas.md section 18). */
export const AI_INSIGHT_CONFIG = {
  /** Changes whenever the prompt in supabase/functions/ai-insight changes; a test keeps the two equal. */
  promptVersion: "insight-1",
  /** How long to wait for the Edge Function before showing the computed summary instead. */
  timeoutMs: 25_000,
  /** Calls that reach the model per student; a cache hit is free and counts for nothing. */
  limits: {
    burst: { limit: 3, windowSeconds: 60 },
    daily: { limit: 40, windowSeconds: 86_400 },
  },
  /** Bounds on what is sent to the model. */
  maxFacts: 40,
  maxFactChars: 240,
  maxTopics: 40,
} as const;
