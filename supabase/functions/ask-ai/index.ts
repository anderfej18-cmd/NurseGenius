import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { GatewayError, handleAskAi, type AskAiDeps } from "./handler.ts";
import {
  AI_CONFIG,
  explainableQuestionSchema,
  explanationFromGateway,
  parseAllowedOrigins,
  type Prompt,
} from "./policy.ts";

// Wiring only: every decision lives in handler.ts and policy.ts, which are tested without Deno
// (ADR-0006). Secrets come from the Edge Function environment and are never logged.
const url = requiredEnv("SUPABASE_URL");
const anonKey = requiredEnv("SUPABASE_ANON_KEY");
const gatewayKey = requiredEnv("LOVABLE_API_KEY");
const admin = createClient(url, requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const limitRowSchema = z.object({ allowed: z.boolean(), retry_after_seconds: z.number() });

const deps: AskAiDeps = {
  allowedOrigins: parseAllowedOrigins(Deno.env.get("ALLOWED_ORIGINS")),

  async verifyUser(authorization) {
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (token === "") return null;
    const client = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data, error } = await client.auth.getUser(token);
    return error || !data.user ? null : data.user.id;
  },

  async loadExamQuestion(userId, examId, questionId) {
    const { data, error } = await admin.rpc("get_explainable_question", {
      _user_id: userId,
      _exam_id: examId,
      _question_id: questionId,
    });
    if (error) throw error;
    return firstQuestion(data);
  },

  async loadSharedQuestion(attemptId, accessHash, questionId) {
    const { data, error } = await admin.rpc("get_explainable_shared_question", {
      _attempt_id: attemptId,
      _access_hash: accessHash,
      _question_id: questionId,
    });
    if (error) throw error;
    return firstQuestion(data);
  },

  async consume(bucket, limit, windowSeconds) {
    const { data, error } = await admin.rpc("consume_rate_limit", {
      _bucket: bucket,
      _limit: limit,
      _window_seconds: windowSeconds,
    });
    if (error) throw error;
    const [row] = z.array(limitRowSchema).min(1).parse(data);
    return { allowed: row.allowed, retryAfterSeconds: row.retry_after_seconds };
  },

  explain: callGateway,

  log(message, error) {
    console.error(message, error instanceof Error ? error.message : error);
  },
};

Deno.serve((request) => handleAskAi(request, deps));

function firstQuestion(rows: unknown) {
  const [row] = z.array(explainableQuestionSchema).parse(rows);
  return row ?? null;
}

async function callGateway(prompt: Prompt): Promise<string> {
  let response: Response;
  try {
    response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${gatewayKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: AI_CONFIG.model,
        max_tokens: AI_CONFIG.maxOutputTokens,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
      }),
      signal: AbortSignal.timeout(AI_CONFIG.gatewayTimeoutMs),
    });
  } catch (error) {
    throw new GatewayError("gateway unreachable", 502, String(error));
  }
  if (!response.ok) {
    throw new GatewayError("gateway refused", response.status, await response.text());
  }
  const explanation = explanationFromGateway(await response.json());
  if (explanation === null) throw new GatewayError("empty answer", 502, "no usable text");
  return explanation;
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}
