import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AI_INSIGHT_CONFIG } from "../../../src/server/ai-insights/insight.config";
import { INSIGHT_AI_CONFIG } from "./policy.ts";

const read = (file: string) => readFileSync(join(__dirname, file), "utf8");
const sources = {
  "index.ts": read("index.ts"),
  "handler.ts": read("handler.ts"),
  "policy.ts": read("policy.ts"),
};

// Fitness functions for ADR-0011: they fail if the function is opened to browsers or to other callers.
describe("ai-insight source rules (ADR-0011)", () => {
  it("is not reachable from a browser: no CORS headers of any kind", () => {
    for (const [file, source] of Object.entries(sources)) {
      expect(source, file).not.toMatch(/access-control-allow/i);
    }
  });

  it("accepts only the service-role key, compared in constant time, before anything else", () => {
    expect(sources["handler.ts"]).toContain("isServiceCaller");
    expect(sources["index.ts"]).toContain('requiredEnv("SUPABASE_SERVICE_ROLE_KEY")');
    expect(sources["index.ts"]).not.toMatch(/auth\.getUser|SUPABASE_ANON_KEY/);
    const handler = sources["handler.ts"];
    expect(handler.indexOf("isServiceCaller(")).toBeLessThan(handler.indexOf("request.text()"));
  });

  it("never reads a student, a score or a prompt from the request", () => {
    const policy = sources["policy.ts"];
    const schema = policy.slice(
      policy.indexOf("const requestSchema"),
      policy.indexOf("export type InsightRequest"),
    );
    expect(schema).toMatch(/\.strict\(\)/);
    expect(schema).not.toMatch(/user_?id|score|system|prompt/i);
  });

  it("limits the model's output, bounds the wait, and has a function-wide budget", () => {
    expect(sources["index.ts"]).toContain("max_tokens");
    expect(sources["index.ts"]).toContain("AbortSignal.timeout");
    expect(sources["index.ts"]).toContain("consume_rate_limit");
    expect(sources["handler.ts"]).toContain("ai-insight:global");
  });

  it("keeps the gateway key in this function only", () => {
    expect(sources["index.ts"]).toContain("LOVABLE_API_KEY");
    expect(sources["handler.ts"]).not.toContain("LOVABLE_API_KEY");
    expect(sources["policy.ts"]).not.toContain("LOVABLE_API_KEY");
  });

  it("does not return raw error messages to the caller", () => {
    expect(sources["handler.ts"]).not.toMatch(
      /error:\s*(?:e|err|error)\s*(?:instanceof|\.message)/,
    );
  });

  it("uses the same prompt version as the Worker, so a changed prompt regenerates stored text", () => {
    expect(INSIGHT_AI_CONFIG.promptVersion).toBe(AI_INSIGHT_CONFIG.promptVersion);
  });
});

// The Edge Functions run on Deno, but their logic is tested on Node with the packages installed here. The
// tests only prove anything about production if both run the same versions.
describe("ai-insight dependency versions", () => {
  it("are pinned in deno.json to the versions the tests run against", () => {
    const imports = JSON.parse(read("deno.json")).imports as Record<string, string>;
    for (const name of ["zod", "@supabase/supabase-js"]) {
      const installed = JSON.parse(
        readFileSync(join(__dirname, "../../../node_modules", name, "package.json"), "utf8"),
      ).version as string;
      expect(imports[name], name).toBe(`npm:${name}@${installed}`);
    }
  });
});
