import { describe, expect, it } from "vitest";
import { changedFields, formatTags, parseTags, toDifficulty } from "./admin-view";

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
