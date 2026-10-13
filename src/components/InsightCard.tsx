import { RefreshCw, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getAiInsight } from "@/functions/ai-insights.functions";
import { useServerData } from "@/hooks/use-server-data";
import type { InsightKind } from "@/lib/ai-insights";
import { insightBadge, insightNotice } from "@/lib/insight-view";

interface Props {
  kind: InsightKind;
  /** The day's study time, for the recommendation. */
  availableMinutes?: number;
  /** The exam the readiness is for. */
  examType?: "RN" | "RM";
}

/**
 * Explains a measured result in plain words. The figures above it always come from the student's own
 * records; this card only phrases them, says whether an AI wrote the words, and falls back to a
 * computed summary whenever the AI text is not available.
 */
export function InsightCard({ kind, availableMinutes, examType }: Props) {
  const insight = useServerData(
    () =>
      getAiInsight({
        data: {
          kind,
          ...(availableMinutes === undefined ? {} : { availableMinutes }),
          ...(examType === undefined ? {} : { examType }),
        },
      }),
    [kind, availableMinutes, examType],
  );
  const result = insight.data;

  return (
    <section
      aria-label="Explanation"
      aria-busy={insight.loading}
      className="flex flex-col gap-3 rounded-lg bg-sunken p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles aria-hidden="true" className="size-4 text-primary" />
          <h3 className="font-sans text-sm font-semibold tracking-normal">In plain words</h3>
          {result && (
            <Badge variant={insightBadge(result).tone === "ai" ? "default" : "secondary"}>
              {insightBadge(result).label}
            </Badge>
          )}
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => void insight.reload()}
          disabled={insight.loading}
          aria-label="Refresh explanation"
        >
          <RefreshCw aria-hidden="true" className={insight.loading ? "animate-spin" : undefined} />
        </Button>
      </div>

      {insight.loading && !result && (
        <div className="flex flex-col gap-2" aria-busy="true">
          <span className="sr-only">Writing your explanation</span>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      )}
      {insight.error && !result && (
        <p className="text-sm text-destructive" role="alert">
          {insight.error}
        </p>
      )}

      {result && (
        <>
          <p className="measure text-sm">{result.narrative.summary}</p>
          {result.narrative.points.length > 0 && (
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
              {result.narrative.points.map((point) => (
                <li key={`${point.topic ?? "general"}-${point.text}`}>
                  {point.topic !== null && <span className="font-medium">{point.topic}: </span>}
                  {point.text}
                </li>
              ))}
            </ul>
          )}
          <p className="text-sm font-medium">Next: {result.narrative.nextAction}</p>
          {insightNotice(result) !== null && (
            <p className="text-xs text-muted-foreground">{insightNotice(result)}</p>
          )}
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer rounded-sm focus-ring">
              What this is based on
            </summary>
            <ul className="mt-2 flex list-disc flex-col gap-0.5 pl-5">
              {result.facts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </details>
          {result.source === "ai" && (
            <p className="text-xs text-muted-foreground">
              The wording was written by AI from the measurements above, which come from your own
              answers. It is study guidance, not medical or clinical advice.
              {result.generatedAt !== null &&
                ` Written ${new Date(result.generatedAt).toLocaleString()}.`}
            </p>
          )}
        </>
      )}
    </section>
  );
}
