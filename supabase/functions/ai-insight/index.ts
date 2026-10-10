import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { GatewayError, handleAiInsight, type AiInsightDeps } from "./handler.ts";
import { INSIGHT_AI_CONFIG, narrativeFromGateway, type Prompt } from "./policy.ts";

// Wiring only: every decision lives in handler.ts and policy.ts, which are tested without Deno
// (ADR-0011). Secrets come from the Edge Function environment and are never logged.
const gatewayKey = requiredEnv("LOVABLE_API_KEY");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const admin = createClient(requiredEnv("SUPABASE_URL"), serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const limitRowSchema = z.object({ allowed: z.boolean(), retry_after_seconds: z.number() });

const deps: AiInsightDeps = {
  serviceRoleKey,

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

  generate: callGateway,

  log(message, detail) {
    console.error(message, detail);
  },
};

Deno.serve((request) => handleAiInsight(request, deps));

async function callGateway(prompt: Prompt) {
  let response: Response;
  try {
    response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${gatewayKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: INSIGHT_AI_CONFIG.model,
        max_tokens: INSIGHT_AI_CONFIG.maxOutputTokens,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
      }),
      signal: AbortSignal.timeout(INSIGHT_AI_CONFIG.gatewayTimeoutMs),
    });
  } catch (error) {
    throw new GatewayError("gateway unreachable", 502, String(error));
  }
  if (!response.ok) {
    throw new GatewayError("gateway refused", response.status, await response.text());
  }
  const answer = narrativeFromGateway(await response.json());
  if (answer === null) throw new GatewayError("unusable answer", 502, "no JSON object in reply");
  return answer;
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}
