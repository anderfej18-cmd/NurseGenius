import type { Tier } from "@/lib/exam-rules";
import type { QuestionFields } from "@/lib/questions";

import type { Difficulty, ExamType } from "../types";
export type { ExamType };
export type Confidence = "low" | "medium" | "high";
export type AnswerLetter = "A" | "B" | "C" | "D";
import type { SelectionMode } from "@/lib/session-modes";
export type { SelectionMode };

/** Session types a learner starts from the exam screen (docs/api/sessions.md, session modes). */
export type StartedSessionType = "mixed" | "topic_practice" | "mistake_review" | "revision";

export interface StartSessionInput {
  examType: ExamType;
  category: string;
  count: number;
  minutes: number;
  /** Defaults to "random". The client names a mode, never the questions. */
  selection?: SelectionMode;
  /** The question to find similar ones to; present exactly when `selection` is "similar". */
  similarTo?: string;
}

export interface SaveAnswerInput {
  examId: string;
  questionId: string;
  answer?: AnswerLetter;
  confidence?: Confidence;
  flagged?: boolean;
  hintUsed?: true;
  timeSpentMs?: number;
}

export interface Quota {
  tier: Tier;
  expiryDate: string | null;
  questionsToday: number;
  lastQuestionDate: string | null;
}

export interface PoolQuestion extends QuestionFields {
  id: string;
  topic: string;
  /** Admin-set difficulty; null when unknown. */
  difficulty: Difficulty | null;
}

export interface SessionRecord {
  id: string;
  examType: ExamType;
  category: string;
  sessionType: string;
  status: string;
  startedAt: string;
  deadlineAt: string;
  completedAt: string | null;
  timeLimitMinutes: number;
  totalQuestions: number;
  correctCount: number | null;
  scorePct: number | null;
  autoSubmitted: boolean;
}

/** One finished test as the repository reads it. */
export interface HistoryRow {
  id: string;
  examType: ExamType;
  category: string;
  sessionType: string;
  completedAt: string;
  totalQuestions: number;
  correctCount: number | null;
  scorePct: number | null;
  /** True once the server has recomputed the score from the answer key. */
  scoreVerified: boolean;
  autoSubmitted: boolean;
}

/** Repository row including the answer key. The service strips it before anything leaves the server. */
export interface SessionItemRow {
  answerId: string;
  questionId: string;
  position: number;
  userAnswer: string | null;
  isCorrect: boolean | null;
  flagged: boolean;
  confidence: Confidence | null;
  /** Why the question was chosen; null for a session started before reasons were kept. */
  selectionReason: string | null;
  question: QuestionFields & { id: string; topic: string; rationale: string | null };
}

export interface SubmitResult {
  examId: string;
  alreadyCompleted: boolean;
  correctCount: number;
  totalQuestions: number;
  scorePct: number;
  autoSubmitted: boolean;
}

export type SaveAnswerOutcome = "ok" | "not_found" | "closed";

export interface StartSessionRecord {
  userId: string;
  examType: ExamType;
  category: string;
  sessionType: StartedSessionType;
  minutes: number;
  topics: string[];
  questionIds: string[];
  today: string;
}

// ---- Public shapes (what server functions return) ----

export interface SessionSummary {
  id: string;
  examType: ExamType;
  category: string;
  status: string;
  startedAt: string;
  deadlineAt: string;
  /** Server clock at response time, so the browser can show an accurate countdown. */
  serverNow: string;
  timeLimitMinutes: number;
  totalQuestions: number;
}

export interface SessionItemView {
  answerId: string;
  questionId: string;
  position: number;
  userAnswer: string | null;
  flagged: boolean;
  confidence: Confidence | null;
  question: {
    id: string;
    topic: string;
    question_text: string | null;
    option_a: string | null;
    option_b: string | null;
    option_c: string | null;
    option_d: string | null;
  };
}

export interface SessionView {
  session: SessionSummary;
  items: SessionItemView[];
}

/** Same field names the results page already renders. */
export interface ResultsView {
  exam: {
    score_pct: number | null;
    correct_count: number | null;
    total_questions: number;
    exam_type: ExamType;
  };
  items: Array<{
    user_answer: string | null;
    is_correct: boolean | null;
    flagged: boolean;
    position: number;
    selection_reason: string | null;
    questions: {
      id: string;
      question_text: string | null;
      correct_answer: string | null;
      rationale: string | null;
      topic: string;
      option_a: string | null;
      option_b: string | null;
      option_c: string | null;
      option_d: string | null;
    };
  }>;
}

/** A student's finished tests, newest first, with the average the server computed. */
export interface HistoryView {
  exams: HistoryRow[];
  verifiedCount: number;
  /** Tests whose stored score has not been checked against the answer key; they are left out of the average. */
  unverifiedCount: number;
  /** Mean of the verified scores to one decimal; null when there is none (never a made-up zero). */
  averageScorePct: number | null;
}
