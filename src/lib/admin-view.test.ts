import { describe, expect, it } from "vitest";
import {
  averageScores,
  changedFields,
  destinationTopic,
  formatNaira,
  formatTags,
  matchesUser,
  parseTags,
  planDraftErrors,
  summarizePayments,
  tierAllowance,
  tierChoiceLabel,
  TIERS,
  toDifficulty,
} from "./admin-view";

describe("parseTags", () => {
  it("splits on commas, trims, drops blanks, and keeps the first of any repeat (any case)", () => {
    expect(parseTags(" Cardiac , drugs,, DRUGS ,  emergency ")).toEqual([
      "Cardiac",
      "drugs",
      "emergency",
    ]);
  });

  it("returns an empty list for blank input", () => {
    expect(parseTags("   ")).toEqual([]);
    expect(parseTags("")).toEqual([]);
  });
});

describe("formatTags", () => {
  it("joins tags the way parseTags reads them back", () => {
    expect(parseTags(formatTags(["a", "b c"]))).toEqual(["a", "b c"]);
  });
});

describe("toDifficulty", () => {
  it("reads the three levels and treats anything else as not set", () => {
    expect(["easy", "medium", "hard", "", "extreme"].map(toDifficulty)).toEqual([
      "easy",
      "medium",
      "hard",
      null,
      null,
    ]);
  });
});

describe("changedFields", () => {
  const original = { difficulty: "easy" as const, tags: ["a"], subtopicId: null as string | null };

  it("is empty when nothing changed", () => {
    expect(changedFields(original, { difficulty: "easy", tags: ["a"], subtopicId: null })).toEqual(
      {},
    );
  });

  it("names only what changed, including clearing a value", () => {
    expect(changedFields(original, { difficulty: null, tags: ["a"], subtopicId: "s1" })).toEqual({
      difficulty: null,
      subtopicId: "s1",
    });
  });

  it("compares tag lists by content, not identity", () => {
    expect(
      changedFields(original, { difficulty: "easy", tags: ["a", "b"], subtopicId: null }),
    ).toEqual({ tags: ["a", "b"] });
  });
});

describe("tier wording", () => {
  it("lists the tiers in rank order and states each allowance from the exam rules", () => {
    expect(TIERS).toEqual(["novice", "erudite", "scholar"]);
    expect(tierAllowance("novice")).toBe("50 a day, 50 per test");
    expect(tierAllowance("erudite")).toBe("500 a day, 150 per test");
    expect(tierAllowance("scholar")).toBe("Unlimited a day, 250 per test");
    expect(tierChoiceLabel("erudite")).toBe("Erudite (500 a day, 150 per test)");
  });
});

describe("formatNaira", () => {
  it("writes the naira sign and thousands separators", () => {
    expect(formatNaira(0)).toBe("₦0");
    expect(formatNaira(12500)).toBe("₦12,500");
    expect(formatNaira(Number("3000"))).toBe("₦3,000");
  });
});

describe("summarizePayments", () => {
  it("counts distinct payers, purchases per plan and the total", () => {
    const summary = summarizePayments([
      { user_id: "a", plan_name: "erudite", amount_ngn: 2000 },
      { user_id: "a", plan_name: "scholar", amount_ngn: 5000 },
      { user_id: "b", plan_name: "Erudite", amount_ngn: 2000 },
    ]);
    expect(summary).toEqual({
      students: 2,
      purchases: { erudite: 2, scholar: 1 },
      collected: 9000,
    });
  });

  it("is all zero for no payments", () => {
    expect(summarizePayments([])).toEqual({ students: 0, purchases: {}, collected: 0 });
  });
});

describe("averageScores", () => {
  it("averages each person's scores and counts their tests", () => {
    const scores = averageScores([
      { user_id: "a", score_pct: 60 },
      { user_id: "a", score_pct: 80 },
      { user_id: "b", score_pct: 55 },
      { user_id: "c", score_pct: null },
    ]);
    expect(scores).toEqual({ a: { average: 70, tests: 2 }, b: { average: 55, tests: 1 } });
  });
});

describe("matchesUser", () => {
  const user = { username: "Ada Obi", email: "ada@example.com" };
  it("matches part of the name or the email in any case, and everyone on blank text", () => {
    expect(matchesUser(user, "OBI")).toBe(true);
    expect(matchesUser(user, " example.com ")).toBe(true);
    expect(matchesUser(user, "")).toBe(true);
    expect(matchesUser(user, "zed")).toBe(false);
  });

  it("copes with a missing name or email", () => {
    expect(matchesUser({ username: null, email: null }, "a")).toBe(false);
    expect(matchesUser({ username: null, email: null }, "")).toBe(true);
  });
});

describe("planDraftErrors", () => {
  it("accepts a price above zero and a whole number of days", () => {
    expect(planDraftErrors({ price_ngn: 2500, duration_days: 30 })).toEqual({});
  });

  it("names a price or length that is zero, negative or not a number, and a fractional number of days", () => {
    expect(planDraftErrors({ price_ngn: 0, duration_days: 30 }).price).toBeDefined();
    expect(planDraftErrors({ price_ngn: 2500, duration_days: -1 }).days).toBeDefined();
    expect(planDraftErrors({ price_ngn: 2500, duration_days: 30.5 }).days).toBeDefined();
    expect(planDraftErrors({ price_ngn: 99.5, duration_days: 30 })).toEqual({});
    expect(planDraftErrors({ price_ngn: Number.NaN, duration_days: Number.NaN })).toEqual({
      price: expect.any(String),
      days: expect.any(String),
    });
  });
});

describe("destinationTopic", () => {
  const topics = ["Cardiac", "Maternal"];
  it("uses the typed name for a new subcategory, trimmed", () => {
    expect(
      destinationTopic({ mode: "new", existing: "Cardiac", newName: "  Renal " }, topics),
    ).toBe("Renal");
  });

  it("uses the picked topic when it is on the list", () => {
    expect(destinationTopic({ mode: "existing", existing: "Maternal", newName: "" }, topics)).toBe(
      "Maternal",
    );
  });

  it("falls back to the first topic when the pick is not on the list, and to empty with no topics", () => {
    expect(
      destinationTopic({ mode: "existing", existing: "Paediatric", newName: "" }, topics),
    ).toBe("Cardiac");
    expect(destinationTopic({ mode: "existing", existing: "", newName: "" }, [])).toBe("");
  });
});
