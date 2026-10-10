import { describe, expect, it } from "vitest";
import { FOLLOW_UP_MAX, FOLLOW_UP_MIN, followUpProblem, helpChoicesFor } from "./ask-ai";

describe("helpChoicesFor", () => {
  it("offers explain, simplify and compare to everyone", () => {
    expect(helpChoicesFor(false).map((c) => c.intent)).toEqual([
      "explain",
      "simplify",
      "compare_options",
    ]);
  });

  it("adds 'why was I wrong' only for a question the student got wrong", () => {
    expect(helpChoicesFor(true).map((c) => c.intent)).toEqual([
      "explain",
      "simplify",
      "compare_options",
      "why_wrong",
    ]);
  });

  it("gives every choice a label", () => {
    for (const choice of helpChoicesFor(true)) expect(choice.label.length).toBeGreaterThan(3);
  });
});

describe("followUpProblem", () => {
  it("accepts a question within the bounds, and an empty box", () => {
    expect(followUpProblem("Why not atropine?")).toBeNull();
    expect(followUpProblem("")).toBeNull();
    expect(followUpProblem("   ")).toBeNull();
  });

  it("says what is wrong with one that is too short or too long", () => {
    expect(followUpProblem("hi")).toMatch(new RegExp(`at least ${FOLLOW_UP_MIN}`));
    expect(followUpProblem("x".repeat(FOLLOW_UP_MAX + 1))).toMatch(new RegExp(`${FOLLOW_UP_MAX}`));
  });
});
