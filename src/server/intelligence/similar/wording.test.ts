import { describe, expect, it } from "vitest";
import { wordingSimilarity } from "./wording";

describe("wordingSimilarity", () => {
  it("is 1 for the same words in any order, case or punctuation", () => {
    expect(
      wordingSimilarity(
        "Which diuretic causes hypokalemia, requiring potassium monitoring?",
        "Potassium monitoring is required: hypokalemia is caused by which diuretic",
      ),
    ).toBeGreaterThanOrEqual(0.5);
    expect(
      wordingSimilarity(
        "loop diuretic furosemide hypokalemia",
        "HYPOKALEMIA: furosemide, loop diuretic",
      ),
    ).toBe(1);
  });

  it("is 0 for questions that share no meaningful words", () => {
    expect(
      wordingSimilarity(
        "Insulin administration for diabetic ketoacidosis",
        "Stages of normal labour and delivery",
      ),
    ).toBe(0);
  });

  it("ignores words every exam question uses, so they cannot make unrelated questions look alike", () => {
    expect(
      wordingSimilarity(
        "Which of the following is the priority nursing action for the patient?",
        "Which of the following is the best action the nurse should take for the client?",
      ),
    ).toBe(0);
  });

  it("is 0 when too few meaningful words are shared to mean anything", () => {
    expect(
      wordingSimilarity(
        "heparin anticoagulant therapy monitoring",
        "heparin dosage calculation weights",
      ),
    ).toBe(0);
  });

  it("is 0 for empty text", () => {
    expect(wordingSimilarity("", "heparin anticoagulant therapy")).toBe(0);
    expect(wordingSimilarity("", "")).toBe(0);
  });

  it("is symmetric", () => {
    const a = "loop diuretic furosemide hypokalemia potassium";
    const b = "furosemide potassium depletion diuretic therapy";
    expect(wordingSimilarity(a, b)).toBe(wordingSimilarity(b, a));
  });
});
