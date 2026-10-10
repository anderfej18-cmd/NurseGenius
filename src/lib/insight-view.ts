// Wording for the AI explanation card. Pure, so the screen stays humble and the words are tested.

interface Describes {
  readonly source: "ai" | "computed";
  readonly status: "ok" | "insufficient_data" | "ai_unavailable" | "rate_limited";
}

/** AI text is always labelled as such; a computed summary is never dressed up as AI. */
export function insightBadge({ source }: Describes): { label: string; tone: "ai" | "computed" } {
  return source === "ai"
    ? { label: "AI-assisted", tone: "ai" }
    : { label: "Computed summary", tone: "computed" };
}

/** Why the student is reading the computed summary, or null when the AI text is shown. */
export function insightNotice({
  source,
  status,
}: Describes & { generatedAt?: string | null }): string | null {
  if (source === "ai") return null;
  switch (status) {
    case "insufficient_data":
      return "There is not enough practice history yet for a personal explanation.";
    case "rate_limited":
      return "You have asked often today. Here is the computed summary instead; try again later.";
    case "ai_unavailable":
    case "ok":
      return "The AI explanation is not available right now, so this summary is computed from your results.";
  }
}

export const readinessReadingNote = (): string =>
  "Readiness is an estimate from your practice so far, not a prediction or a guarantee of your exam result.";
