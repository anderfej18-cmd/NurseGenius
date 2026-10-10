import { describe, expect, it } from "vitest";
import { checkGrounding } from "./grounding";
import type { InsightFacts, Narrative } from "./insight.types";

const facts: InsightFacts = {
  kind: "readiness",
  facts: [
    "Pharmacology mastery is 42.5% from 36 answers.",
    "Your exam is in 21 days.",
    "Accuracy over the last 14 days is 61%.",
  ],
  topics: ["Pharmacology", "Maternal Health"],
  sufficientEvidence: true,
  fallback: { summary: "x", points: [], nextAction: "y" },
};

const narrative = (overrides: Partial<Narrative> = {}): Narrative => ({
  summary: "Pharmacology is your weakest area at 42.5%.",
  points: [{ topic: "Pharmacology", text: "Review it before your exam in 21 days." }],
  nextAction: "Do a short Pharmacology practice session today.",
  ...overrides,
});

describe("checkGrounding", () => {
  it("accepts a narrative that uses only the topics and numbers in the facts", () => {
    expect(checkGrounding(narrative(), facts)).toEqual({ ok: true });
  });

  it("accepts a number written differently from the fact (42.5 and 42.50, 61 and 61%)", () => {
    const text = narrative({ summary: "About 42.50% mastery and 61% accuracy." });
    expect(checkGrounding(text, facts)).toEqual({ ok: true });
  });

  it("matches topics regardless of case and spacing, and allows a point with no topic", () => {
    const text = narrative({
      points: [
        { topic: "  pharmacology ", text: "Keep going." },
        { topic: null, text: "Steady practice helps." },
      ],
    });
    expect(checkGrounding(text, facts)).toEqual({ ok: true });
  });

  it("rejects a topic the student has no facts about", () => {
    const text = narrative({ points: [{ topic: "Cardiology", text: "Study it." }] });
    expect(checkGrounding(text, facts)).toEqual({ ok: false, reason: "unknown_topic" });
  });

  it("rejects a number that is not in the facts, wherever it appears", () => {
    for (const bad of [
      narrative({ summary: "You are at 80% mastery." }),
      narrative({ points: [{ topic: null, text: "Aim for 90 questions." }] }),
      narrative({ nextAction: "Practise for 45 minutes." }),
    ]) {
      expect(checkGrounding(bad, facts)).toEqual({ ok: false, reason: "ungrounded_number" });
    }
  });

  it.each([
    "You are guaranteed to pass.",
    "You will pass this exam.",
    "This guarantees success.",
    "You will definitely pass.",
    "You are going to fail if you stop.",
  ])("rejects a promise about the result: %s", (summary) => {
    expect(checkGrounding(narrative({ summary }), facts)).toEqual({
      ok: false,
      reason: "certainty_claim",
    });
  });

  it("rejects links", () => {
    const text = narrative({ nextAction: "Read more at https://example.com today." });
    expect(checkGrounding(text, facts)).toEqual({ ok: false, reason: "link" });
  });

  it("does not mistake ordinary words for promises", () => {
    const text = narrative({ summary: "Passing needs steady practice; this is an estimate." });
    expect(checkGrounding(text, facts)).toEqual({ ok: true });
  });
});
