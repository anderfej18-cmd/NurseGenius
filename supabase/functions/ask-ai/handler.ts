import {
  AI_CONFIG,
  type AskAiRequest,
  type ExplainableQuestion,
  type Prompt,
  buildPrompt,
  isHelpApplicable,
  isOriginAllowed,
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

export interface AskAiDeps {
  readonly allowedOrigins: readonly string[];
  /** The signed-in student behind the bearer token, or null (the anon key is not a student). */
  verifyUser(authorization: string | null): Promise<string | null>;
  loadExamQuestion(
    userId: string,
    examId: string,
    questionId: string,
  ): Promise<ExplainableQuestion | null>;
  loadSharedQuestion(
    attemptId: string,
    accessHash: string,
    questionId: string,
  ): Promise<ExplainableQuestion | null>;
  consume(
    bucket: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
  explain(prompt: Prompt): Promise<string>;
  log(message: string, error: unknown): void;
}

const MESSAGES = {
  invalid: "That request is not valid.",
  unauthorized: "Sign in to continue.",
  origin: "Origin not allowed.",
  unavailable: "That question cannot be explained.",
  notApplicable: "That kind of help does not apply to this question.",
  method: "Method not allowed.",
  tooLarge: "That request is too large.",
  busy: "Too many requests. Please wait and try again.",
  failed: "Something went wrong. Please try again.",
  gateway: "The AI tutor could not answer. Please try again.",
  credits: "The AI tutor is unavailable right now.",
} as const;

export async function handleAskAi(request: Request, deps: AskAiDeps): Promise<Response> {
  const origin = request.headers.get("origin");
  if (!isOriginAllowed(origin, deps.allowedOrigins)) {
    return reply(403, { error: MESSAGES.origin }, null);
  }
  if (request.method === "OPTIONS") return reply(204, null, origin);
  if (request.method !== "POST") return reply(405, { error: MESSAGES.method }, origin);

  try {
    return await answer(request, deps, origin);
  } catch (error) {
    if (error instanceof GatewayError) {
      deps.log("AI gateway error", error.detail);
      if (error.status === 429) return busy(origin, 30);
      if (error.status === 402) return reply(503, { error: MESSAGES.credits }, origin);
      return reply(502, { error: MESSAGES.gateway }, origin);
    }
    deps.log("ask-ai failed", error);
    return reply(500, { error: MESSAGES.failed }, origin);
  }
}

async function answer(request: Request, deps: AskAiDeps, origin: string | null): Promise<Response> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > AI_CONFIG.maxBodyBytes) return reply(413, { error: MESSAGES.tooLarge }, origin);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > AI_CONFIG.maxBodyBytes) {
    return reply(413, { error: MESSAGES.tooLarge }, origin);
  }
  const parsed = parseRequest(raw);
  if (!parsed.ok) return reply(400, { error: MESSAGES.invalid }, origin);

  const address = addressOf(request);
  const found =
    parsed.value.kind === "exam"
      ? await forExam(parsed.value, request, deps, address)
      : await forShared(parsed.value, deps, address);
  if (found.kind === "reply") return withCors(found.response, origin);

  const intent = parsed.value.intent ?? "explain";
  if (!isHelpApplicable(intent, found.question)) {
    return reply(400, { error: MESSAGES.notApplicable }, origin);
  }
  const explanation = await deps.explain(
    buildPrompt(found.question, { intent, followUp: parsed.value.followUp }),
  );
  return reply(200, { explanation }, origin);
}

type Found =
  | { kind: "question"; question: ExplainableQuestion }
  | { kind: "reply"; response: Response };

async function forExam(
  request: Extract<AskAiRequest, { kind: "exam" }>,
  http: Request,
  deps: AskAiDeps,
  address: string,
): Promise<Found> {
  const userId = await deps.verifyUser(http.headers.get("authorization"));
  if (userId === null) return answerWith(401, MESSAGES.unauthorized);

  const limited = await firstRefusal(deps, [
    [`ai:burst:${userId}`, AI_CONFIG.limits.userBurst],
    [`ai:daily:${userId}`, AI_CONFIG.limits.userDaily],
    [`ai:ip:${address}`, AI_CONFIG.limits.address],
  ]);
  if (limited !== null) return { kind: "reply", response: limited };

  const question = await deps.loadExamQuestion(userId, request.examId, request.questionId);
  return question === null ? answerWith(404, MESSAGES.unavailable) : { kind: "question", question };
}

async function forShared(
  request: Extract<AskAiRequest, { kind: "shared" }>,
  deps: AskAiDeps,
  address: string,
): Promise<Found> {
  // The address limit comes first so guessing attempt keys is throttled before any lookup.
  const limited = await firstRefusal(deps, [[`ai:ip:${address}`, AI_CONFIG.limits.address]]);
  if (limited !== null) return { kind: "reply", response: limited };

  const question = await deps.loadSharedQuestion(
    request.attemptId,
    await sha256Hex(request.accessKey),
    request.questionId,
  );
  if (question === null) return answerWith(404, MESSAGES.unavailable);

  const attemptLimited = await firstRefusal(deps, [
    [`ai:attempt:${request.attemptId}`, AI_CONFIG.limits.sharedAttempt],
  ]);
  return attemptLimited === null
    ? { kind: "question", question }
    : { kind: "reply", response: attemptLimited };
}

type Rule = readonly [
  bucket: string,
  limit: { readonly limit: number; readonly windowSeconds: number },
];

async function firstRefusal(deps: AskAiDeps, rules: readonly Rule[]): Promise<Response | null> {
  for (const [bucket, { limit, windowSeconds }] of rules) {
    const result = await deps.consume(bucket, limit, windowSeconds);
    if (!result.allowed) return busy(null, result.retryAfterSeconds);
  }
  return null;
}

const answerWith = (status: number, error: string): Found => ({
  kind: "reply",
  response: reply(status, { error }, null),
});

function busy(origin: string | null, retryAfterSeconds: number): Response {
  const response = reply(429, { error: MESSAGES.busy }, origin);
  response.headers.set("retry-after", String(Math.max(1, Math.round(retryAfterSeconds))));
  return response;
}

function addressOf(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return request.headers.get("cf-connecting-ip") ?? (forwarded || "unknown");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function reply(status: number, body: unknown, origin: string | null): Response {
  const headers = new Headers({ "content-type": "application/json" });
  const response = new Response(body === null ? null : JSON.stringify(body), { status, headers });
  return withCors(response, origin);
}

/** An allowed origin is echoed back exactly (never `*`); anything else gets no CORS headers. */
function withCors(response: Response, origin: string | null): Response {
  if (origin === null) return response;
  response.headers.set("access-control-allow-origin", origin);
  response.headers.set(
    "access-control-allow-headers",
    "authorization, x-client-info, apikey, content-type",
  );
  response.headers.set("access-control-allow-methods", "POST, OPTIONS");
  response.headers.set("access-control-max-age", "600");
  response.headers.append("vary", "Origin");
  return response;
}
