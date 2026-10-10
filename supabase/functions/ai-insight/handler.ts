import {
  INSIGHT_AI_CONFIG,
  type GatewayAnswer,
  type Prompt,
  buildPrompt,
  isServiceCaller,
  parseRequest,
} from "./policy.ts";

/** The AI gateway refused or failed. `detail` is for the server log only. */
export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail: string,
  ) {
    super(message);
  }
}

export interface AiInsightDeps {
  /** The project's service-role key: the only credential this function accepts (ADR-0011). */
  readonly serviceRoleKey: string;
  consume(
    bucket: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
  generate(prompt: Prompt): Promise<GatewayAnswer>;
  log(message: string, detail: unknown): void;
}

const MESSAGES = {
  invalid: "That request is not valid.",
  unauthorized: "Not allowed.",
  method: "Method not allowed.",
  tooLarge: "That request is too large.",
  busy: "Too many requests. Please wait and try again.",
  failed: "Something went wrong.",
  gateway: "The AI service could not answer.",
  credits: "The AI service is unavailable right now.",
} as const;

/**
 * Phrases measured facts. Called only by the Worker, with the service-role key: no browser reaches it,
 * so it sends no CORS headers. It never learns who the student is.
 */
export async function handleAiInsight(request: Request, deps: AiInsightDeps): Promise<Response> {
  if (request.method !== "POST") return reply(405, { error: MESSAGES.method });
  if (!isServiceCaller(request.headers.get("authorization"), deps.serviceRoleKey)) {
    return reply(401, { error: MESSAGES.unauthorized });
  }
  try {
    return await answer(request, deps);
  } catch (error) {
    if (error instanceof GatewayError) {
      deps.log("AI gateway error", error.detail);
      if (error.status === 429) return busy(30);
      if (error.status === 402) return reply(503, { error: MESSAGES.credits });
      return reply(502, { error: MESSAGES.gateway });
    }
    deps.log("ai-insight failed", error instanceof Error ? error.name : "unknown");
    return reply(500, { error: MESSAGES.failed });
  }
}

async function answer(request: Request, deps: AiInsightDeps): Promise<Response> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > INSIGHT_AI_CONFIG.maxBodyBytes) return reply(413, { error: MESSAGES.tooLarge });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > INSIGHT_AI_CONFIG.maxBodyBytes) {
    return reply(413, { error: MESSAGES.tooLarge });
  }
  const parsed = parseRequest(raw);
  if (!parsed.ok) return reply(400, { error: MESSAGES.invalid });

  const { limit, windowSeconds } = INSIGHT_AI_CONFIG.global;
  const budget = await deps.consume("ai-insight:global", limit, windowSeconds);
  if (!budget.allowed) return busy(budget.retryAfterSeconds);

  const { narrative, usage } = await deps.generate(buildPrompt(parsed.value));
  return reply(200, {
    narrative,
    model: INSIGHT_AI_CONFIG.model,
    promptVersion: INSIGHT_AI_CONFIG.promptVersion,
    usage,
  });
}

function busy(retryAfterSeconds: number): Response {
  const response = reply(429, { error: MESSAGES.busy });
  response.headers.set("retry-after", String(Math.max(1, Math.round(retryAfterSeconds))));
  return response;
}

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
