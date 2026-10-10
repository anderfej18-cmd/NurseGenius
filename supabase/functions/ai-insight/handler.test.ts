import { describe, expect, it, vi } from "vitest";
import { GatewayError, type AiInsightDeps, handleAiInsight } from "./handler.ts";

const KEY = "service-role-key-".padEnd(40, "x");
const BODY = JSON.stringify({
  kind: "readiness",
  facts: ["Readiness estimate: 54.2% (developing), based on 340 answers."],
  topics: ["Pharmacology"],
});

function setup(overrides: Partial<AiInsightDeps> = {}) {
  const deps = {
    serviceRoleKey: KEY,
    consume: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })),
    generate: vi.fn(async () => ({
      narrative: { summary: "s", points: [], nextAction: "n" },
      usage: { promptTokens: 100, completionTokens: 50 },
    })),
    log: vi.fn(),
    ...overrides,
  } satisfies AiInsightDeps;
  const post = (
    body: string = BODY,
    headers: Record<string, string> = { authorization: `Bearer ${KEY}` },
  ) =>
    handleAiInsight(
      new Request("https://f.test/ai-insight", { method: "POST", body, headers }),
      deps,
    );
  return { deps, post };
}

describe("handleAiInsight", () => {
  it("answers a valid request from the server with the narrative, the model and the version", async () => {
    const { post, deps } = setup();
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      narrative: { summary: "s", points: [], nextAction: "n" },
      model: "google/gemini-3-flash-preview",
      promptVersion: "insight-1",
      usage: { promptTokens: 100, completionTokens: 50 },
    });
    expect(deps.generate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["no credentials", {}],
    ["the public anon key", { authorization: "Bearer anon-key-not-the-service-key" }],
    ["a student's token", { authorization: "Bearer eyJ.student.token" }],
  ])("refuses %s without reaching the model", async (_label, headers) => {
    const { post, deps } = setup();
    const response = await post(BODY, headers);
    expect(response.status).toBe(401);
    expect(deps.generate).not.toHaveBeenCalled();
    expect(deps.consume).not.toHaveBeenCalled();
  });

  it("allows only POST", async () => {
    const { deps } = setup();
    for (const method of ["GET", "PUT", "DELETE", "OPTIONS"]) {
      const response = await handleAiInsight(
        new Request("https://f.test/", { method, headers: { authorization: `Bearer ${KEY}` } }),
        deps,
      );
      expect(response.status).toBe(405);
    }
  });

  it("sends no CORS headers: no browser is meant to call it", async () => {
    const { post } = setup();
    const response = await post();
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it.each([
    ["malformed JSON", "{nope"],
    ["an unknown kind", JSON.stringify({ kind: "x", facts: ["a"], topics: [] })],
    ["a student id", JSON.stringify({ kind: "readiness", facts: ["a"], topics: [], userId: "u" })],
  ])("rejects %s with 400 and does not call the model", async (_label, body) => {
    const { post, deps } = setup();
    expect((await post(body)).status).toBe(400);
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it("rejects an oversized body with 413", async () => {
    const { post, deps } = setup();
    const big = JSON.stringify({
      kind: "readiness",
      facts: ["a"],
      topics: [],
      pad: "x".repeat(40_000),
    });
    expect((await post(big)).status).toBe(413);
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it("stops everything with 429 when the function-wide budget is used up", async () => {
    const { post, deps } = setup({
      consume: vi.fn(async () => ({ allowed: false, retryAfterSeconds: 120 })),
    });
    const response = await post();
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("120");
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it.each([
    [429, 429],
    [402, 503],
    [500, 502],
    [404, 502],
  ])(
    "maps a gateway answer of %i to %i and keeps its detail out of the reply",
    async (gateway, expected) => {
      const { post, deps } = setup({
        generate: async () => {
          throw new GatewayError("refused", gateway, "secret gateway detail with key sk-123");
        },
      });
      const response = await post();
      expect(response.status).toBe(expected);
      expect(await response.text()).not.toContain("sk-123");
      expect(deps.log).toHaveBeenCalled();
    },
  );

  it("answers an unexpected failure with a generic 500", async () => {
    const { post } = setup({
      generate: async () => {
        throw new Error("boom with LOVABLE_API_KEY=abc");
      },
    });
    const response = await post();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("abc");
  });
});
