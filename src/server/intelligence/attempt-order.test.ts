import { describe, expect, it } from "vitest";
import type { AttemptSignal } from "./attempt.types";
import { byAnsweredAt } from "./attempt-order";

const at = (iso: string, questionId = "q", sessionId = "s", correct = true): AttemptSignal => ({
  questionId,
  topic: "t",
  examType: "RN",
  sessionId,
  correct,
  answeredAt: new Date(iso),
  difficulty: null,
  confidence: null,
  timeSpentMs: null,
});

describe("byAnsweredAt", () => {
  it("orders by time, oldest first", () => {
    const sorted = [at("2026-10-02T00:00:00Z"), at("2026-10-01T00:00:00Z")].sort(byAnsweredAt);
    expect(sorted.map((a) => a.answeredAt.toISOString())).toEqual([
      "2026-10-01T00:00:00.000Z",
      "2026-10-02T00:00:00.000Z",
    ]);
  });

  it("breaks ties by question, then session, then the wrong answer before the right one", () => {
    const t = "2026-10-01T00:00:00Z";
    const sorted = [
      at(t, "b"),
      at(t, "a", "s2"),
      at(t, "a", "s1", true),
      at(t, "a", "s1", false),
    ].sort(byAnsweredAt);
    expect(sorted.map((a) => `${a.questionId}${a.sessionId}${a.correct}`)).toEqual([
      "as1false",
      "as1true",
      "as2true",
      "bstrue",
    ]);
  });

  it("gives the same order whatever the input order", () => {
    const t = "2026-10-01T00:00:00Z";
    const items = [at(t, "c"), at(t, "a"), at(t, "b")];
    expect([...items].sort(byAnsweredAt)).toEqual([...items].reverse().sort(byAnsweredAt));
  });
});
