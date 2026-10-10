import { z } from "zod";
import {
  type InsightNarrator,
  NarratorUnavailableError,
  type NarratorResult,
} from "./insight.service";

const answerSchema = z
  .object({
    narrative: z.record(z.string(), z.unknown()),
    model: z.string().min(1).max(100),
    promptVersion: z.string().min(1).max(40),
    usage: z
      .object({
        promptTokens: z.number().int().min(0),
        completionTokens: z.number().int().min(0),
      })
      .strict(),
  })
  .strict();

interface Options {
  readonly functionUrl: string;
  readonly serviceRoleKey: string;
  readonly timeoutMs: number;
  readonly fetch?: typeof fetch;
}

/**
 * Asks the `ai-insight` Edge Function to phrase measured facts. The gateway key stays in that function's
 * secrets (ADR-0006, ADR-0011); this side holds only the service-role key it already has, which the
 * function checks. Every failure is reported as one kind of error with no detail from the provider.
 */
export class EdgeInsightNarrator implements InsightNarrator {
  constructor(private readonly options: Options) {}

  async narrate(request: Parameters<InsightNarrator["narrate"]>[0]): Promise<NarratorResult> {
    const { functionUrl, serviceRoleKey, timeoutMs } = this.options;
    const send = this.options.fetch ?? fetch;
    let response: Response;
    try {
      response = await send(functionUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${serviceRoleKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(request),
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new NarratorUnavailableError("The AI function could not be reached.");
    }
    if (!response.ok) {
      throw new NarratorUnavailableError(`The AI function answered ${response.status}.`);
    }

    const parsed = answerSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success)
      throw new NarratorUnavailableError("The AI function's answer was malformed.");
    const { narrative, model, promptVersion, usage } = parsed.data;
    return {
      narrative,
      model,
      promptVersion,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
    };
  }
}
