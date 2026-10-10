import { describe, expect, it } from "vitest";
import { factsHash } from "./facts-hash";
import type { InsightFacts } from "./insight.types";

const facts = (overrides: Partial<InsightFacts> = {}): InsightFacts => ({
  kind: "readiness",
  facts: ["a", "b"],
  topics: ["T"],
  sufficientEvidence: true,
  fallback: { summary: "s", points: [], nextAction: "n" },
  ...overrides,
});

describe("factsHash", () => {
  it("is a 64-character hex digest, the same for the same facts", async () => {
    const one = await factsHash(facts(), "v1");
    expect(one).toMatch(/^[0-9a-f]{64}$/);
    expect(await factsHash(facts(), "v1")).toBe(one);
  });

  it("changes when a fact, a topic, the kind or the prompt version changes", async () => {
    const base = await factsHash(facts(), "v1");
    const others = await Promise.all([
      factsHash(facts({ facts: ["a", "c"] }), "v1"),
      factsHash(facts({ topics: ["U"] }), "v1"),
      factsHash(facts({ kind: "recommendation" }), "v1"),
      factsHash(facts(), "v2"),
    ]);
    for (const other of others) expect(other).not.toBe(base);
  });

  it("ignores the computed summary, which does not change what the model is shown", async () => {
    const base = await factsHash(facts(), "v1");
    const other = await factsHash(
      facts({ fallback: { summary: "different", points: [], nextAction: "n" } }),
      "v1",
    );
    expect(other).toBe(base);
  });
});
