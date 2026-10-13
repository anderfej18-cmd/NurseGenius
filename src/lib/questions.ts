export interface QuestionFields {
  question_text: string | null;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  correct_answer: string | null;
}

const OPTION_KEYS = ["option_a", "option_b", "option_c", "option_d"] as const;

/** How `questionIssues` names a missing option: "OPTION A". */
export const missingOptionIssue = (letter: "A" | "B" | "C" | "D"): string => `OPTION ${letter}`;

export function questionIssues(question: QuestionFields): string[] {
  const issues: string[] = [];
  const questionText = question.question_text?.trim() ?? "";
  // Some malformed uploads contain only the question number (for example
  // `34.`). They render as a card with no actual question, so treat them as
  // broken just like an empty stem.
  if (!questionText || /^(?:question\s*)?\d+\s*[.)]?$/i.test(questionText)) {
    issues.push("question text");
  }
  for (const key of OPTION_KEYS) {
    if (!question[key]?.trim())
      issues.push(missingOptionIssue(key.slice(-1).toUpperCase() as "A" | "B" | "C" | "D"));
  }
  if (
    !question.correct_answer ||
    !["A", "B", "C", "D"].includes(question.correct_answer.trim().toUpperCase())
  ) {
    issues.push("correct answer");
  }
  return issues;
}

export function isCompleteQuestion(question: QuestionFields): boolean {
  return questionIssues(question).length === 0;
}

/**
 * Records that look complete but are malformed in a way a person has to judge: two options with the
 * same text cannot both be a distinct choice. Reported next to the missing-field issues; never repaired
 * automatically, because which option is wrong is the editor's call.
 */
export function questionMalformations(question: QuestionFields): string[] {
  const found: string[] = [];
  const seen = new Map<string, string>();
  for (const key of OPTION_KEYS) {
    const text = question[key]?.trim().toLowerCase() ?? "";
    if (text === "") continue;
    const letter = key.slice(-1).toUpperCase();
    const earlier = seen.get(text);
    if (earlier !== undefined) found.push(`options ${earlier} and ${letter} are identical`);
    else seen.set(text, letter);
  }
  return found;
}

/** Everything the audit reports about one question: what is missing and what is malformed. */
export function auditQuestion(question: QuestionFields): {
  missing: string[];
  malformed: string[];
} {
  return { missing: questionIssues(question), malformed: questionMalformations(question) };
}
