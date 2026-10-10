import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(join(__dirname, file), "utf8");
const sources = {
  "index.ts": read("index.ts"),
  "handler.ts": read("handler.ts"),
  "policy.ts": read("policy.ts"),
};

// Fitness functions for ADR-0006: they fail if the old holes are reopened.
describe("ask-ai source rules (ADR-0006)", () => {
  it("never answers with a wildcard CORS origin", () => {
    for (const [file, source] of Object.entries(sources)) {
      expect(source, file).not.toMatch(/Access-Control-Allow-Origin["']?\s*:\s*["']\*/i);
      expect(source, file).not.toMatch(/allow-origin["']\s*,\s*["']\*["']/i);
    }
  });

  it("never builds the prompt from client-supplied question content", () => {
    for (const field of ["question_text", "options", "correct", "topic"]) {
      expect(sources["index.ts"], `index.ts reads ${field} from the body`).not.toMatch(
        new RegExp(`(?:body|json|await\\s+\\w+\\.json\\(\\))\\s*\\)?\\.${field}\\b`),
      );
    }
    expect(sources["policy.ts"]).toMatch(/\.strict\(\)/);
  });

  it("limits the model's output, bounds the wait, and uses the shared limiter", () => {
    expect(sources["index.ts"]).toContain("max_tokens");
    expect(sources["index.ts"]).toContain("AbortSignal.timeout");
    expect(sources["index.ts"]).toContain("consume_rate_limit");
  });

  it("does not return raw error messages to the caller", () => {
    expect(sources["handler.ts"]).not.toMatch(
      /error:\s*(?:e|err|error)\s*(?:instanceof|\.message)/,
    );
    expect(sources["index.ts"]).not.toMatch(/JSON\.stringify\(\{\s*error:\s*(?:e|err|error)/);
  });

  it("refuses the anon key as an identity for exam explanations", () => {
    expect(sources["index.ts"]).toContain("auth.getUser(token)");
  });
});

// The Edge Functions run on Deno, but their logic is tested on Node with the packages installed here. The
// tests only prove anything about production if both run the same versions.
describe("ask-ai dependency versions", () => {
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
