import { ALL_AREAS } from "@/lib/exam-rules";
import { isCompleteQuestion } from "@/lib/questions";
import {
  bestEffort,
  ConflictError,
  NotFoundError,
  SessionClosedError,
  ValidationError,
} from "../errors";
import { assertWithinTierLimits } from "./quota";
import { type SelectionReason, sessionTypeFor } from "@/lib/session-modes";
import { sampleWithoutReplacement } from "./sampling";
import type {
  ExamType,
  HistoryRow,
  HistoryView,
  PoolQuestion,
  Quota,
  ResultsView,
  SaveAnswerInput,
  SaveAnswerOutcome,
  SessionItemRow,
  SessionItemView,
  SessionRecord,
  SelectionMode,
  SessionView,
  StartSessionInput,
  StartSessionRecord,
  SubmitResult,
} from "./session.types";

/** Seconds after the deadline during which an in-flight answer is still accepted (network latency). */
export const ANSWER_GRACE_SECONDS = 10;

/** How many of a student's mistakes or due reviews are considered for one session (the largest session). */
const FOCUS_CANDIDATES = 250;

export interface SessionRepository {
  getQuota(userId: string): Promise<Quota | null>;
  /** Every active question of the exam type (optionally one topic), answer key included. */
  listQuestionPool(examType: ExamType, topic: string | null): Promise<PoolQuestion[]>;
  /**
   * Question ids a focus selection starts from, most important first: the student's unresolved
   * mistakes, or the questions whose review date has arrived.
   */
  listFocusQuestionIds(
    userId: string,
    examType: ExamType,
    focus: "mistakes" | "due",
    now: Date,
    limit: number,
  ): Promise<string[]>;
  /** Stores why each question was chosen: {question id: reason}. Explanatory only. */
  recordSelectionReasons(
    userId: string,
    examId: string,
    reasons: Readonly<Record<string, string>>,
  ): Promise<void>;
  /** The student's finished tests, newest first. */
  listCompleted(userId: string, limit: number): Promise<HistoryRow[]>;
  /** Throws ConflictError when the student already has an active session. */
  startSession(record: StartSessionRecord): Promise<string>;
  getSession(userId: string, examId: string): Promise<SessionRecord | null>;
  listItems(userId: string, examId: string): Promise<SessionItemRow[]>;
  saveAnswer(
    userId: string,
    input: SaveAnswerInput,
    graceSeconds: number,
  ): Promise<SaveAnswerOutcome>;
  /** Scores the session from the answer key. Throws NotFoundError for a session the student does not own. */
  submit(userId: string, examId: string): Promise<SubmitResult>;
}

interface Dependencies {
  repository: SessionRepository;
  clock: () => Date;
  /** Uniform float in [0, 1); injected so selection is testable. */
  random: () => number;
  /** Brings what is derived from the student's history up to date (reviews, XP, achievements) after an exam is scored. Must not throw. */
  afterScoring: (userId: string) => Promise<void>;
  /** Chooses the questions for sessions started in adaptive mode. */
  adaptiveSelection: {
    pickWithReasons(
      userId: string,
      pool: readonly PoolQuestion[],
      count: number,
    ): Promise<Array<{ question: PoolQuestion; reason: SelectionReason }>>;
  };
  /** The questions most like one the student has answered, best first. */
  similar: {
    find(
      userId: string,
      questionId: string,
      limit: number,
    ): Promise<{ items: ReadonlyArray<{ id: string }> }>;
  };
}

export class SessionService {
  constructor(private readonly deps: Dependencies) {}

  async start(
    userId: string,
    input: StartSessionInput,
  ): Promise<{ examId: string; totalQuestions: number }> {
    const { repository, clock, random } = this.deps;
    const now = clock();
    const today = now.toISOString().slice(0, 10);

    const quota = await repository.getQuota(userId);
    if (!quota) throw new NotFoundError("Profile not found.");
    assertWithinTierLimits(quota, input.count, now);

    const topic = input.category === ALL_AREAS ? null : input.category;
    const pool = (await repository.listQuestionPool(input.examType, topic)).filter(
      isCompleteQuestion,
    );
    if (pool.length === 0) {
      throw new ValidationError(
        "No questions available for this selection. Ask an admin to upload some.",
      );
    }

    const selection = input.selection ?? "random";
    const chosen = await this.choose(userId, input, selection, pool, now);
    const picked = chosen.map((entry) => entry.question);
    if (picked.length === 0)
      throw new ValidationError("No questions available for this selection.");
    const examId = await repository.startSession({
      userId,
      examType: input.examType,
      category: input.category,
      sessionType: sessionTypeFor(selection, topic),
      minutes: input.minutes,
      topics: [...new Set(picked.map((q) => q.topic))].sort(),
      questionIds: picked.map((q) => q.id),
      today,
    });
    // Explanatory only: failing to keep the reasons must not stop the student from starting.
    await bestEffort(
      () =>
        repository.recordSelectionReasons(
          userId,
          examId,
          Object.fromEntries(chosen.map(({ question, reason }) => [question.id, reason])),
        ),
      "selection reasons",
    );
    return { examId, totalQuestions: picked.length };
  }

  /** Picks the session's questions on the server, by the selection mode the student named. */
  private async choose(
    userId: string,
    input: StartSessionInput,
    selection: SelectionMode,
    pool: readonly PoolQuestion[],
    now: Date,
  ): Promise<Array<{ question: PoolQuestion; reason: SelectionReason }>> {
    const { repository, random } = this.deps;
    const because = (reason: SelectionReason) => (question: PoolQuestion) => ({ question, reason });
    if (selection === "random") {
      return sampleWithoutReplacement(pool, input.count, random).map(because("random"));
    }
    if (selection === "adaptive") {
      return this.deps.adaptiveSelection.pickWithReasons(userId, pool, input.count);
    }
    if (selection === "similar") return this.similarTo(userId, input, pool);

    const ids = await repository.listFocusQuestionIds(
      userId,
      input.examType,
      selection,
      now,
      FOCUS_CANDIDATES,
    );
    const byId = new Map(pool.map((question) => [question.id, question]));
    const focus = ids.flatMap((id) => byId.get(id) ?? []);
    if (focus.length === 0) {
      throw new ValidationError(
        selection === "mistakes"
          ? "You have no mistakes to review yet."
          : "Nothing is due for review right now.",
      );
    }
    return sampleWithoutReplacement(focus.slice(0, input.count), input.count, random).map(
      because(selection === "mistakes" ? "previous_mistake" : "due_review"),
    );
  }

  /** The questions most like the one the student named, kept to those in this exam's pool. */
  private async similarTo(
    userId: string,
    input: StartSessionInput,
    pool: readonly PoolQuestion[],
  ): Promise<Array<{ question: PoolQuestion; reason: SelectionReason }>> {
    if (input.similarTo === undefined) {
      throw new ValidationError("Choose a question to find similar ones to.");
    }
    const { items } = await this.deps.similar.find(userId, input.similarTo, input.count);
    const byId = new Map(pool.map((question) => [question.id, question]));
    const found = items.flatMap(({ id }) => byId.get(id) ?? []);
    if (found.length === 0) throw new ValidationError("There are no similar questions available.");
    return found.map((question) => ({ question, reason: "similar" as const }));
  }

  async get(userId: string, examId: string): Promise<SessionView> {
    const record = await this.requireSession(userId, examId);
    const summary = (status: string) => this.summarize(record, status);

    if (record.status === "in_progress" && this.isPastDeadline(record)) {
      await this.finalize(userId, examId);
      return { session: summary("completed"), items: [] };
    }
    if (record.status !== "in_progress") return { session: summary(record.status), items: [] };

    const rows = await this.deps.repository.listItems(userId, examId);
    const items = rows.filter((row) => isCompleteQuestion(row.question)).map(toItemView);
    return { session: summary(record.status), items };
  }

  async saveAnswer(userId: string, input: SaveAnswerInput): Promise<{ ok: true }> {
    const changesSomething =
      input.answer !== undefined ||
      input.confidence !== undefined ||
      input.flagged !== undefined ||
      input.hintUsed !== undefined ||
      input.timeSpentMs !== undefined;
    if (!changesSomething) throw new ValidationError("Nothing to save.");

    const outcome = await this.deps.repository.saveAnswer(userId, input, ANSWER_GRACE_SECONDS);
    if (outcome === "not_found") throw new NotFoundError("Question not found in this exam.");
    if (outcome === "closed")
      throw new SessionClosedError("This exam is closed and no longer accepts answers.");
    return { ok: true };
  }

  submit(userId: string, examId: string): Promise<SubmitResult> {
    return this.finalize(userId, examId);
  }

  /** Finished tests with the average of the verified ones, so no screen has to average scores itself. */
  async history(userId: string, limit: number): Promise<HistoryView> {
    const exams = await this.deps.repository.listCompleted(userId, limit);
    const verified = exams.filter((exam) => exam.scoreVerified && exam.scorePct !== null);
    const total = verified.reduce((sum, exam) => sum + (exam.scorePct ?? 0), 0);
    return {
      exams,
      verifiedCount: verified.length,
      unverifiedCount: exams.length - verified.length,
      averageScorePct:
        verified.length === 0 ? null : Math.round((total / verified.length) * 10) / 10,
    };
  }

  async results(userId: string, examId: string): Promise<ResultsView> {
    let record = await this.requireSession(userId, examId);
    if (record.status === "in_progress") {
      if (!this.isPastDeadline(record)) {
        throw new ConflictError("Results are available after you submit the exam.");
      }
      await this.finalize(userId, examId);
      record = await this.requireSession(userId, examId);
    }

    const rows = await this.deps.repository.listItems(userId, examId);
    return {
      exam: {
        score_pct: record.scorePct,
        correct_count: record.correctCount,
        total_questions: record.totalQuestions,
        exam_type: record.examType,
      },
      items: rows.map((row) => ({
        user_answer: row.userAnswer,
        is_correct: row.isCorrect,
        flagged: row.flagged,
        position: row.position,
        selection_reason: row.selectionReason,
        questions: {
          id: row.question.id,
          question_text: row.question.question_text,
          correct_answer: row.question.correct_answer,
          rationale: row.question.rationale,
          topic: row.question.topic,
          option_a: row.question.option_a,
          option_b: row.question.option_b,
          option_c: row.question.option_c,
          option_d: row.question.option_d,
        },
      })),
    };
  }

  /** Scores the exam; the first time it is scored, everything derived from the history is brought up to date. */
  private async finalize(userId: string, examId: string): Promise<SubmitResult> {
    const result = await this.deps.repository.submit(userId, examId);
    if (!result.alreadyCompleted) await this.deps.afterScoring(userId);
    return result;
  }

  private async requireSession(userId: string, examId: string): Promise<SessionRecord> {
    const record = await this.deps.repository.getSession(userId, examId);
    if (!record) throw new NotFoundError("Exam not found.");
    return record;
  }

  private isPastDeadline(record: SessionRecord): boolean {
    return this.deps.clock().getTime() > new Date(record.deadlineAt).getTime();
  }

  private summarize(record: SessionRecord, status: string): SessionView["session"] {
    return {
      id: record.id,
      examType: record.examType,
      category: record.category,
      status,
      startedAt: record.startedAt,
      deadlineAt: record.deadlineAt,
      serverNow: this.deps.clock().toISOString(),
      timeLimitMinutes: record.timeLimitMinutes,
      totalQuestions: record.totalQuestions,
    };
  }
}

/** Explicit field list: the answer key and rationale can never leak through a spread. */
function toItemView(row: SessionItemRow): SessionItemView {
  return {
    answerId: row.answerId,
    questionId: row.questionId,
    position: row.position,
    userAnswer: row.userAnswer,
    flagged: row.flagged,
    confidence: row.confidence,
    question: {
      id: row.question.id,
      topic: row.question.topic,
      question_text: row.question.question_text,
      option_a: row.question.option_a,
      option_b: row.question.option_b,
      option_c: row.question.option_c,
      option_d: row.question.option_d,
    },
  };
}
