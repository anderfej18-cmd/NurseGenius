import { describe, expect, it } from "vitest";
import type { AttemptSignal } from "./attempt.types";
import { countRepeatedMistakes } from "./repeated-mistakes";

let clock = 0;
const attempt = (questionId: string, correct: boolean): AttemptSignal => ({
  questionId,
  topic: "Pharmacology",
  examType: "RN",
  sessionId: "s",
  correct,
  answeredAt: new Date(Date.UTC(2026, 0, 1) + (clock += 1000)),
  difficulty: null,
  confidence: null,
  timeSpentMs: null,
});

describe("countRepeatedMistakes", () => {
  it("counts a question missed at least twice whose latest answer is still wrong", () => {
    const sorted = [attempt("a", false), attempt("a", false), attempt("b", true)];
    expect(countRepeatedMistakes(sorted, 2)).toEqual({ repeated: 1, questions: 2 });
  });

  it("does not count a question that has been answered correctly since", () => {
    const sorted = [attempt("a", false), attempt("a", false), attempt("a", true)];
    expect(countRepeatedMistakes(sorted, 2)).toEqual({ repeated: 0, questions: 1 });
  });

  it("does not count a single miss", () => {
    expect(countRepeatedMistakes([attempt("a", false)], 2)).toEqual({ repeated: 0, questions: 1 });
  });

  it("uses the threshold it is given", () => {
    const sorted = [attempt("a", false), attempt("a", false), attempt("a", false)];
    expect(countRepeatedMistakes(sorted, 3).repeated).toBe(1);
    expect(countRepeatedMistakes(sorted, 4).repeated).toBe(0);
  });

  it("is empty for no attempts", () => {
    expect(countRepeatedMistakes([], 2)).toEqual({ repeated: 0, questions: 0 });
  });
});
