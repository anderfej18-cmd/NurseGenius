import type { ExamType } from "../types";

export const MAX_BOOKMARKS_PER_STUDENT = 2000;

export interface BookmarkListRequest {
  examType?: ExamType;
  topic?: string;
  limit?: number;
  offset?: number;
}

export interface BookmarkQuery {
  examType?: ExamType;
  topic?: string;
  /** Includes the extra row used to detect a next page. */
  limit: number;
  offset: number;
}

/** Repository row: question content without the answer key. */
export interface BookmarkRow {
  questionId: string;
  note: string | null;
  createdAt: string;
  question: {
    exam_type: ExamType;
    topic: string;
    question_text: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
  };
}

export interface BookmarkItem {
  questionId: string;
  note: string | null;
  createdAt: string;
  examType: ExamType;
  topic: string;
  question: {
    question_text: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
  };
}
