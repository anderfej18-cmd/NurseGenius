import type { ExamType } from "../types";

export type MistakeView = "all" | "most_repeated" | "recent" | "repeatedly_failed";

export interface MistakeRequest {
  view: MistakeView;
  examType?: ExamType;
  topic?: string;
  limit?: number;
  offset?: number;
}

/** A view translated into concrete filters; produced by the service, applied by the repository. */
export interface MistakeSpec {
  sort: "recent" | "most_missed";
  minMisses: number;
  unresolvedOnly: boolean;
  /** Only mistakes last missed at or after this instant. */
  since: string | null;
}

export interface MistakeQuery {
  spec: MistakeSpec;
  examType?: ExamType;
  topic?: string;
  /** Includes the extra row used to detect a next page. */
  limit: number;
  offset: number;
}

export interface MistakeRow {
  questionId: string;
  misses: number;
  attempts: number;
  correct: number;
  lastMissedAt: string | null;
  lastAnswer: string | null;
  unresolved: boolean;
  question: {
    id: string;
    exam_type: ExamType;
    topic: string;
    question_text: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    correct_answer: string;
    rationale: string | null;
  };
}

export interface MistakeItem {
  questionId: string;
  examType: ExamType;
  topic: string;
  misses: number;
  attempts: number;
  correct: number;
  lastMissedAt: string | null;
  lastAnswer: string | null;
  unresolved: boolean;
  /** True while the question is part of the student's running exam: the key is withheld. */
  answerWithheld: boolean;
  question: {
    question_text: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    correct_answer: string | null;
    rationale: string | null;
  };
}
