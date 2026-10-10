import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError } from "../errors";
import { factsHash } from "./facts-hash";
import { AI_INSIGHT_CONFIG } from "./insight.config";
import {
  AiInsightService,
  type InsightNarrator,
  NarratorUnavailableError,
  type StoredInsight,
} from "./insight.service";
import type { InsightFacts, Narrative } from "./insight.types";

const USER = "user-1";
const NOW = new Date("2026-10-09T12:00:00.000Z");
const VERSION = AI_INSIGHT_CONFIG.promptVersion;

const facts = (overrides: Partial<InsightFacts> = {}): InsightFacts => ({
  kind: "readiness",
  facts: [
    "Readiness estimate: 54.2% (developing), based on 340 answers.",
    "Pharmacology: mastery 38.5% (weak).",
  ],
  topics: ["Pharmacology"],
  sufficientEvidence: true,
  fallback: { summary: "Computed summary.", points: [], nextAction: "Computed next step." },
  ...overrides,
});

const GOOD: Narrative = {
  summary: "Your estimate is 54.2% and Pharmacology at 38.5% needs the most work.",
  points: [{ topic: "Pharmacology", text: "Mastery is 38.5%." }],
  nextAction: "Practise Pharmacology today.",
};

function setup(
  options: {
    facts?: InsightFacts;
    stored?: StoredInsight | null;
    narrate?: InsightNarrator["narrate"];
    allowed?: boolean;
    save?: () => Promise<void>;
  } = {},
) {
  const provided = options.facts ?? facts();
  const store = {
    find: vi.fn(async (_user: string, _kind: string) => options.stored ?? null),
    save: vi.fn(options.save ?? (async () => undefined)),
  };
  const narrator = {
    narrate: vi.fn(
      options.narrate ??
        (async () => ({
          narrative: GOOD,
          model: "test-model",
          promptVersion: VERSION,
          promptTokens: 120,
          completionTokens: 60,
        })),
    ),
  };
  const limiter = {
    consume: vi.fn(async () => ({ allowed: options.allowed ?? true, retryAfterSeconds: 30 })),
  };
  const log = vi.fn();
  const buildFacts = vi.fn(async (_user: string) => provided);
  const service = new AiInsightService({
    facts: {
      readiness: buildFacts,
      recommendation: buildFacts,
      performance: buildFacts,
      plan: buildFacts,
    },
    store,
    narrator,
    limiter,
    clock: () => NOW,
    log,
  });
  return { service, store, narrator, limiter, log, buildFacts, provided };
}

const get = (s: ReturnType<typeof setup>, kind: "readiness" | "recommendation" = "readiness") =>
  s.service.get(USER, kind);

describe("AiInsightService.get", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes the explanation with the model when the facts are new, and stores it", async () => {
    const s = setup();
    const result = await get(s);
    expect(result).toMatchObject({
      kind: "readiness",
      source: "ai",
      status: "ok",
      narrative: GOOD,
      generatedAt: NOW.toISOString(),
      facts: s.provided.facts,
    });
    expect(s.store.save).toHaveBeenCalledTimes(1);
    expect(s.store.save).toHaveBeenCalledWith(
      USER,
      "readiness",
      expect.objectContaining({
        factsHash: await factsHash(s.provided, VERSION),
        narrative: GOOD,
        model: "test-model",
        promptTokens: 120,
        completionTokens: 60,
      }),
    );
  });

  it("sends the model only the measured statements and topics, never the student or the summary", async () => {
    const s = setup();
    await get(s);
    expect(s.narrator.narrate).toHaveBeenCalledWith({
      kind: "readiness",
      facts: s.provided.facts,
      topics: s.provided.topics,
    });
    expect(JSON.stringify(s.narrator.narrate.mock.calls)).not.toContain(USER);
  });

  it("returns the stored explanation, free of cost, while the facts are unchanged", async () => {
    const hash = await factsHash(facts(), VERSION);
    const s = setup({
      stored: { factsHash: hash, narrative: GOOD, generatedAt: "2026-10-08T08:00:00.000Z" },
    });
    const result = await get(s);
    expect(result).toMatchObject({
      source: "ai",
      status: "ok",
      generatedAt: "2026-10-08T08:00:00.000Z",
    });
    expect(s.narrator.narrate).not.toHaveBeenCalled();
    expect(s.limiter.consume).not.toHaveBeenCalled();
    expect(s.store.save).not.toHaveBeenCalled();
  });

  it("writes a new explanation when the facts or the prompt version changed", async () => {
    const stale = setup({
      stored: {
        factsHash: "0".repeat(64),
        narrative: GOOD,
        generatedAt: "2026-10-01T00:00:00.000Z",
      },
    });
    expect((await get(stale)).generatedAt).toBe(NOW.toISOString());
    expect(stale.narrator.narrate).toHaveBeenCalledTimes(1);
  });

  it("counts each model call against the student's burst and daily limits, before calling the model", async () => {
    const s = setup();
    await get(s);
    expect(s.limiter.consume).toHaveBeenCalledWith(
      `ai-insight:burst:${USER}`,
      AI_INSIGHT_CONFIG.limits.burst.limit,
      AI_INSIGHT_CONFIG.limits.burst.windowSeconds,
    );
    expect(s.limiter.consume).toHaveBeenCalledWith(
      `ai-insight:daily:${USER}`,
      AI_INSIGHT_CONFIG.limits.daily.limit,
      AI_INSIGHT_CONFIG.limits.daily.windowSeconds,
    );
  });

  it("shows the computed summary, not an error, when the student has asked too often", async () => {
    const s = setup({ allowed: false });
    const result = await get(s);
    expect(result).toMatchObject({
      source: "computed",
      status: "rate_limited",
      narrative: s.provided.fallback,
    });
    expect(s.narrator.narrate).not.toHaveBeenCalled();
  });

  it("makes no model call and shows the computed summary when there is too little history", async () => {
    const s = setup({ facts: facts({ sufficientEvidence: false }) });
    const result = await get(s);
    expect(result).toMatchObject({
      source: "computed",
      status: "insufficient_data",
      generatedAt: null,
    });
    expect(s.narrator.narrate).not.toHaveBeenCalled();
    expect(s.limiter.consume).not.toHaveBeenCalled();
    expect(s.store.find).not.toHaveBeenCalled();
  });

  it.each([
    ["the provider is down", () => Promise.reject(new NarratorUnavailableError("down"))],
    [
      "the request fails unexpectedly",
      () => Promise.reject(new Error("socket hang up (key=sk-secret)")),
    ],
  ])(
    "falls back to the computed summary when %s, saving nothing and leaking nothing",
    async (_label, narrate) => {
      const s = setup({ narrate });
      const result = await get(s);
      expect(result).toMatchObject({
        source: "computed",
        status: "ai_unavailable",
        narrative: s.provided.fallback,
      });
      expect(s.store.save).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).not.toContain("sk-secret");
      expect(s.log).toHaveBeenCalled();
    },
  );

  it.each([
    ["the output is not the expected shape", { summary: "only a summary" }],
    ["the output carries an unexpected field", { ...GOOD, extra: "x" }],
    ["the text promises a result", { ...GOOD, summary: "You will pass the exam." }],
    [
      "the text uses a number that was not measured",
      { ...GOOD, summary: "You are at 99% mastery." },
    ],
    [
      "the text names a topic with no facts",
      { ...GOOD, points: [{ topic: "Cardiology", text: "Study." }] },
    ],
    ["the output is not an object", "just text"],
  ])("discards the model's answer when %s", async (_label, narrative) => {
    const s = setup({
      narrate: async () => ({
        narrative,
        model: "m",
        promptVersion: VERSION,
        promptTokens: 1,
        completionTokens: 1,
      }),
    });
    const result = await get(s);
    expect(result).toMatchObject({
      source: "computed",
      status: "ai_unavailable",
      narrative: s.provided.fallback,
    });
    expect(s.store.save).not.toHaveBeenCalled();
  });

  it("still shows the explanation when storing it fails", async () => {
    const s = setup({ save: () => Promise.reject(new Error("db down")) });
    const result = await get(s);
    expect(result).toMatchObject({ source: "ai", status: "ok", narrative: GOOD });
    expect(s.log).toHaveBeenCalled();
  });

  it("asks the model once when the same student asks twice at the same time", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const s = setup({
      narrate: async () => {
        await gate;
        return {
          narrative: GOOD,
          model: "m",
          promptVersion: VERSION,
          promptTokens: 1,
          completionTokens: 1,
        };
      },
    });
    const both = Promise.all([get(s), get(s)]);
    await vi.waitFor(() => expect(s.narrator.narrate).toHaveBeenCalledTimes(1));
    release();
    const [a, b] = await both;
    expect(a.source).toBe("ai");
    expect(b.source).toBe("ai");
    expect(s.narrator.narrate).toHaveBeenCalledTimes(1);
  });

  it("looks up each student's own stored explanation, by kind", async () => {
    const s = setup();
    await s.service.get("user-a", "readiness");
    await s.service.get("user-b", "recommendation");
    expect(s.store.find).toHaveBeenNthCalledWith(1, "user-a", "readiness");
    expect(s.store.find).toHaveBeenNthCalledWith(2, "user-b", "recommendation");
  });

  it("lets a failure to measure the student (such as a missing profile) reach the caller", async () => {
    const s = setup();
    s.buildFacts.mockRejectedValueOnce(new NotFoundError("Profile not found."));
    await expect(get(s)).rejects.toBeInstanceOf(NotFoundError);
  });
});
