import { describe, expect, it } from "vitest";
import { parseStartSearch } from "./start-search";

describe("parseStartSearch", () => {
  it("accepts a topic and a selection mode from the link", () => {
    expect(parseStartSearch({ topic: "Pharmacology", selection: "mistakes" })).toEqual({
      topic: "Pharmacology",
      selection: "mistakes",
    });
  });

  it("accepts the exam the topic belongs to", () => {
    expect(parseStartSearch({ examType: "RM", topic: "Maternal Health" })).toEqual({
      examType: "RM",
      topic: "Maternal Health",
    });
    expect(parseStartSearch({ examType: "MD" })).toEqual({});
  });

  it("accepts either on its own, and nothing", () => {
    expect(parseStartSearch({ topic: "Anatomy" })).toEqual({ topic: "Anatomy" });
    expect(parseStartSearch({ selection: "due" })).toEqual({ selection: "due" });
    expect(parseStartSearch({})).toEqual({});
  });

  it("drops what it does not understand instead of failing the page", () => {
    expect(parseStartSearch({ selection: "cheat", topic: 5 })).toEqual({});
    expect(parseStartSearch({ topic: "" })).toEqual({});
    expect(parseStartSearch({ topic: "x".repeat(201) })).toEqual({});
    expect(parseStartSearch({ unknown: "x", topic: "Anatomy" })).toEqual({ topic: "Anatomy" });
  });

  it("accepts the question to find similar ones to, only as a uuid, and sets the similar mode with it", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    expect(parseStartSearch({ similarTo: id })).toEqual({ similarTo: id, selection: "similar" });
    expect(parseStartSearch({ similarTo: "q-1" })).toEqual({});
    expect(parseStartSearch({ similarTo: id, selection: "due" })).toEqual({
      similarTo: id,
      selection: "similar",
    });
    expect(parseStartSearch({ selection: "similar" })).toEqual({});
  });
});
