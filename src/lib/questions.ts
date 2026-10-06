export interface QuestionFields {
  question_text: string | null;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  correct_answer: string | null;
}

const OPTION_KEYS = ["option_a", "option_b", "option_c", "option_d"] as const;

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
    if (!question[key]?.trim()) issues.push(`${key.replace("option_", "Option ").toUpperCase()}`);
  }
  if (!question.correct_answer || !["A", "B", "C", "D"].includes(question.correct_answer.trim().toUpperCase())) {
    issues.push("correct answer");
  }
  return issues;
}

export function isCompleteQuestion(question: QuestionFields): boolean {
  return questionIssues(question).length === 0;
}