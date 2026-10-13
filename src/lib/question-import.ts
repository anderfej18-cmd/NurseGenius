// Reads the plain-text question format an admin uploads: one block per question, blocks separated by
// a blank line or a line of dashes or equals signs.

export interface ParsedQuestion {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  rationale: string | null;
}

/** The server takes at most this many questions in one import request (each request is all or nothing). */
export const IMPORT_BATCH_SIZE = 500;

const OPTION_LINE = /^([A-D])[).:-]\s*(.*)$/i;
const QUESTION_LINE = /^(?:Q\s*[:.)]|Question\s*[:.)])\s*(.*)$/i;
const ANSWER_LINE = /^(?:Answer|Ans|Correct)\s*[:-]\s*([A-D])/i;
const EXPLANATION_LINE = /^(?:Explanation|Rationale)\s*[:-]\s*(.*)$/i;

function parseBlock(block: string): { question: ParsedQuestion | null; missing: string[] } {
  const options: Record<string, string> = { A: "", B: "", C: "", D: "" };
  let question = "";
  let answer = "";
  let explanation = "";
  let inExplanation = false;
  for (const line of block
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean)) {
    const questionMatch = line.match(QUESTION_LINE);
    const optionMatch = line.match(OPTION_LINE);
    const answerMatch = line.match(ANSWER_LINE);
    const explanationMatch = line.match(EXPLANATION_LINE);
    if (questionMatch) {
      question = questionMatch[1];
      inExplanation = false;
    } else if (optionMatch) {
      options[optionMatch[1].toUpperCase()] = optionMatch[2];
      inExplanation = false;
    } else if (answerMatch) {
      answer = answerMatch[1].toUpperCase();
      inExplanation = false;
    } else if (explanationMatch) {
      explanation = explanationMatch[1];
      inExplanation = true;
    } else if (inExplanation) {
      explanation += " " + line;
    } else if (!question) {
      question = line;
    }
  }
  const missing = [
    ...(question ? [] : ["the question"]),
    ...(["A", "B", "C", "D"] as const)
      .filter((letter) => !options[letter])
      .map((l) => `option ${l}`),
    ...(answer ? [] : ["the answer line (Answer: A to D)"]),
  ];
  if (missing.length > 0) return { question: null, missing };
  return {
    question: {
      question_text: question,
      option_a: options.A,
      option_b: options.B,
      option_c: options.C,
      option_d: options.D,
      correct_answer: answer,
      rationale: explanation.trim() || null,
    },
    missing,
  };
}

/** A block of the file that could not be read as a question, and what it lacked. */
export interface BlockProblem {
  /** 1-based position among the file's blocks, as a person counts them. */
  readonly block: number;
  readonly missing: readonly string[];
  /** The first words of the block, so it can be found in the file. */
  readonly preview: string;
}

const PREVIEW_LENGTH = 60;

/** Every complete question in the text, and for every block that was skipped, what it lacked. */
export function inspectQuestionText(raw: string): {
  questions: ParsedQuestion[];
  problems: BlockProblem[];
} {
  const questions: ParsedQuestion[] = [];
  const problems: BlockProblem[] = [];
  raw
    .replace(/\r\n/g, "\n")
    .split(/\n\s*(?:---+|===+)\s*\n|\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .forEach((block, index) => {
      const { question, missing } = parseBlock(block);
      if (question) questions.push(question);
      else problems.push({ block: index + 1, missing, preview: block.slice(0, PREVIEW_LENGTH) });
    });
  return { questions, problems };
}

/** Every complete question in the text; a block missing its text, an option or a valid answer is skipped. */
export const parseQuestionText = (raw: string): ParsedQuestion[] =>
  inspectQuestionText(raw).questions;

/** One line for a person: how many blocks were skipped and why the first few were. */
export function describeProblems(problems: readonly BlockProblem[], shown = 3): string {
  if (problems.length === 0) return "";
  const first = problems
    .slice(0, shown)
    .map((p) => `block ${p.block} lacks ${p.missing.join(", ")}`)
    .join("; ");
  const more = problems.length > shown ? `; and ${problems.length - shown} more` : "";
  return `${problems.length} ${problems.length === 1 ? "block was" : "blocks were"} skipped: ${first}${more}.`;
}

/** An import that stopped part way: `imported` questions were saved before the batch that failed. */
export class PartialImportError extends Error {
  constructor(
    message: string,
    readonly imported: number,
  ) {
    super(message);
    this.name = "PartialImportError";
  }
}

/**
 * Sends the questions in batches the server accepts, one after the other. Each batch is all or nothing,
 * so when one fails the earlier ones stay saved: the error says how many.
 */
export async function importInBatches<Q>(
  questions: readonly Q[],
  send: (batch: Q[]) => Promise<unknown>,
): Promise<number> {
  let imported = 0;
  for (let start = 0; start < questions.length; start += IMPORT_BATCH_SIZE) {
    const batch = questions.slice(start, start + IMPORT_BATCH_SIZE);
    try {
      await send(batch);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The import failed.";
      throw new PartialImportError(message, imported);
    }
    imported += batch.length;
  }
  return imported;
}
