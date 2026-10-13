import { describe, expect, it } from "vitest";
import {
  auditQuestion,
  isCompleteQuestion,
  missingOptionIssue,
  questionIssues,
  questionMalformations,
} from "./questions";

const COMPLETE = {
  question_text: "Which organ pumps blood?",
  option_a: "Lung",
  option_b: "Heart",
  option_c: "Liver",
  option_d: "Skin",
  correct_answer: "B",
};

describe("questionIssues", () => {
  it("finds nothing wrong with a complete question", () => {
    expect(questionIssues(COMPLETE)).toEqual([]);
    expect(isCompleteQuestion(COMPLETE)).toBe(true);
  });

  it("names each missing option the way missingOptionIssue spells it", () => {
    const issues = questionIssues({ ...COMPLETE, option_b: " ", option_d: null });
    expect(issues).toEqual([missingOptionIssue("B"), missingOptionIssue("D")]);
    expect(issues).toEqual(["OPTION B", "OPTION D"]);
  });

  it("treats a stem that is only a number as missing text, and a letter outside A to D as no answer", () => {
    expect(questionIssues({ ...COMPLETE, question_text: "34." })).toEqual(["question text"]);
    expect(questionIssues({ ...COMPLETE, correct_answer: "E" })).toEqual(["correct answer"]);
    expect(questionIssues({ ...COMPLETE, correct_answer: " b " })).toEqual([]);
  });
});

describe("questionMalformations and auditQuestion", () => {
  it("finds nothing in a clean question", () => {
    expect(questionMalformations(COMPLETE)).toEqual([]);
  });

  it("reports identical options, ignoring case and spacing, once per repeat", () => {
    expect(questionMalformations({ ...COMPLETE, option_c: " heart ", option_d: "HEART" })).toEqual([
      "options B and C are identical",
      "options B and D are identical",
    ]);
  });

  it("does not call two empty options identical (they are missing, which is a different finding)", () => {
    expect(questionMalformations({ ...COMPLETE, option_c: "", option_d: " " })).toEqual([]);
  });

  it("separates what is missing from what is malformed", () => {
    expect(auditQuestion({ ...COMPLETE, option_a: "Heart", option_c: "" })).toEqual({
      missing: ["OPTION C"],
      malformed: ["options A and B are identical"],
    });
  });
});
