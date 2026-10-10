import { describe, expect, it } from "vitest";
import { insightBadge, insightNotice, readinessReadingNote } from "./insight-view";

describe("insightBadge", () => {
  it("labels AI-written text as AI-assisted", () => {
    expect(insightBadge({ source: "ai", status: "ok" })).toEqual({
      label: "AI-assisted",
      tone: "ai",
    });
  });

  it.each(["insufficient_data", "ai_unavailable", "rate_limited"] as const)(
    "labels everything else as a computed summary, never as AI (%s)",
    (status) => {
      expect(insightBadge({ source: "computed", status })).toEqual({
        label: "Computed summary",
        tone: "computed",
      });
    },
  );
});

describe("insightNotice", () => {
  it("says nothing extra when the AI text is shown", () => {
    expect(insightNotice({ source: "ai", status: "ok", generatedAt: "2026-10-09T10:00:00Z" })).toBe(
      null,
    );
  });

  it("explains each reason the student sees the computed summary", () => {
    expect(insightNotice({ source: "computed", status: "insufficient_data" })).toMatch(
      /not enough practice/i,
    );
    expect(insightNotice({ source: "computed", status: "ai_unavailable" })).toMatch(
      /AI explanation is not available right now/i,
    );
    expect(insightNotice({ source: "computed", status: "rate_limited" })).toMatch(/asked often/i);
  });
});

describe("readinessReadingNote", () => {
  it("always reminds that readiness is an estimate", () => {
    expect(readinessReadingNote()).toMatch(/estimate/i);
    expect(readinessReadingNote()).toMatch(/not a (?:prediction|guarantee)/i);
  });
});
