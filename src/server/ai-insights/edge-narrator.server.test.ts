import { describe, expect, it, vi } from "vitest";
import { EdgeInsightNarrator } from "./edge-narrator.server";
import { NarratorUnavailableError } from "./insight.service";

const KEY = "service-role-secret-value";
const request = { kind: "readiness", facts: ["a 1"], topics: ["T"] } as const;

const okBody = {
  narrative: { summary: "s", points: [], nextAction: "n" },
  model: "m",
  promptVersion: "insight-1",
  usage: { promptTokens: 12, completionTokens: 7 },
};
const reply = (body: unknown, status = 200) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

function narrator(fetchImpl: typeof fetch) {
  return new EdgeInsightNarrator({
    functionUrl: "https://project.supabase.co/functions/v1/ai-insight",
    serviceRoleKey: KEY,
    timeoutMs: 1000,
    fetch: fetchImpl,
  });
}

describe("EdgeInsightNarrator", () => {
  it("posts the facts to the function with the service key, and returns what it answers", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      reply(okBody),
    );
    const result = await narrator(fetchImpl as typeof fetch).narrate(request);
    expect(result).toEqual({
      narrative: okBody.narrative,
      model: "m",
      promptVersion: "insight-1",
      promptTokens: 12,
      completionTokens: 7,
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://project.supabase.co/functions/v1/ai-insight");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(String(init?.body))).toEqual(request);
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ["not deployed", reply({ error: "x" }, 404)],
    ["rate limited by the gateway", reply({ error: "x" }, 429)],
    ["out of credit", reply({ error: "x" }, 503)],
    ["a server error", reply({ error: "x" }, 500)],
    ["unauthorised", reply({ error: "x" }, 401)],
  ])("reports the provider as unavailable when the function is %s", async (_label, response) => {
    await expect(narrator(async () => response).narrate(request)).rejects.toBeInstanceOf(
      NarratorUnavailableError,
    );
  });

  it("reports the provider as unavailable on a network error or timeout", async () => {
    for (const failure of [
      new TypeError("fetch failed"),
      new DOMException("timeout", "TimeoutError"),
    ]) {
      await expect(
        narrator(async () => Promise.reject(failure)).narrate(request),
      ).rejects.toBeInstanceOf(NarratorUnavailableError);
    }
  });

  it.each([
    ["not JSON", reply("<html>")],
    [
      "missing the narrative",
      reply({ model: "m", promptVersion: "v", usage: { promptTokens: 1, completionTokens: 1 } }),
    ],
    [
      "negative token counts",
      reply({ ...okBody, usage: { promptTokens: -1, completionTokens: 1 } }),
    ],
    ["an unexpected shape", reply({ ...okBody, extra: true })],
  ])("reports the provider as unavailable when the answer is %s", async (_label, response) => {
    await expect(narrator(async () => response).narrate(request)).rejects.toBeInstanceOf(
      NarratorUnavailableError,
    );
  });

  it("never puts the service key in an error", async () => {
    const error = await narrator(async () => reply({ error: KEY }, 500))
      .narrate(request)
      .catch((e: unknown) => e);
    expect(String((error as Error).message)).not.toContain(KEY);
  });
});
