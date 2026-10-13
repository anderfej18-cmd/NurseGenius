import { questionIssues } from "@/lib/questions";
import { NotFoundError, ValidationError } from "../errors";
import type { Difficulty, ExamType } from "../types";

/** The most questions one import may add; the whole import is one insert, so it is all or nothing. */
export const MAX_IMPORT = 500;
const MAX_SUBTOPIC_NAME = 120;
const MAX_REPORTED_PROBLEMS = 5;

export type QuestionStatus = "active" | "retired";

/** Question content as stored (database column names). */
export interface NewQuestionContent {
  readonly question_text: string;
  readonly option_a: string;
  readonly option_b: string;
  readonly option_c: string;
  readonly option_d: string;
  readonly correct_answer: string;
  readonly rationale: string | null;
}

export interface NewQuestionRow extends NewQuestionContent {
  readonly exam_type: ExamType;
  readonly topic: string;
  readonly created_by: string;
}

/** Only the columns an update sets. */
export type QuestionChanges = Partial<NewQuestionContent> & {
  difficulty?: Difficulty | null;
  tags?: string[];
  source?: string | null;
  subtopic_id?: string | null;
};

export interface Scope {
  readonly examType: ExamType;
  readonly topic: string;
}

export interface Subtopic extends Scope {
  readonly id: string;
  readonly name: string;
}

/** What this service needs from the rest of the system; declared here, next to its only consumer. */
export interface QuestionAdminStore {
  insertMany(rows: readonly NewQuestionRow[]): Promise<number>;
  /** False when the question does not exist. */
  update(id: string, changes: QuestionChanges): Promise<boolean>;
  setStatus(id: string, status: QuestionStatus): Promise<boolean>;
  /** Deletes for good and records it in the audit log; the database refuses a question students answered. */
  deleteForever(adminId: string, id: string): Promise<void>;
  questionScope(id: string): Promise<Scope | null>;
  subtopicScope(id: string): Promise<Scope | null>;
  listSubtopics(examType: ExamType, topic?: string): Promise<readonly Subtopic[]>;
  createSubtopic(input: Scope & { name: string }): Promise<Subtopic>;
  renameSubtopic(id: string, name: string): Promise<boolean>;
  deleteSubtopic(id: string): Promise<boolean>;
}

/**
 * Admin content management. Callers are already checked to be admins (controller); this service
 * enforces what makes a question valid and keeps the bank consistent. A question students have answered
 * is retired, never deleted, so every past attempt stays valid; an unused one may be deleted (audited).
 */
export class QuestionAdminService {
  constructor(private readonly deps: { readonly store: QuestionAdminStore }) {}

  async create(
    adminId: string,
    input: { examType: ExamType; topic: string; content: NewQuestionContent },
  ): Promise<{ created: number }> {
    return this.insert(adminId, { ...input, questions: [input.content] });
  }

  async import(
    adminId: string,
    input: { examType: ExamType; topic: string; questions: readonly NewQuestionContent[] },
  ): Promise<{ created: number }> {
    return this.insert(adminId, input);
  }

  async update(input: {
    questionId: string;
    content?: NewQuestionContent;
    difficulty?: Difficulty | null;
    tags?: string[];
    source?: string | null;
    subtopicId?: string | null;
  }): Promise<{ updated: true }> {
    const changes: QuestionChanges = {};
    if (input.content !== undefined) {
      const problems = questionIssues(input.content);
      if (problems.length > 0) {
        throw new ValidationError(`The question is incomplete: ${problems.join(", ")}.`);
      }
      Object.assign(changes, normalised(input.content));
    }
    if (input.difficulty !== undefined) changes.difficulty = input.difficulty;
    if (input.tags !== undefined) changes.tags = input.tags;
    if (input.source !== undefined) changes.source = input.source;
    if (input.subtopicId !== undefined) {
      if (input.subtopicId !== null)
        await this.assertSubtopicFits(input.questionId, input.subtopicId);
      changes.subtopic_id = input.subtopicId;
    }
    if (Object.keys(changes).length === 0) throw new ValidationError("There is nothing to change.");
    if (!(await this.deps.store.update(input.questionId, changes))) throw questionNotFound();
    return { updated: true };
  }

  /** Permanent. Only a question no student has answered can go; anything else is retired instead. */
  async delete(adminId: string, questionId: string): Promise<{ deleted: true }> {
    await this.deps.store.deleteForever(adminId, questionId);
    return { deleted: true };
  }

  retire(questionId: string): Promise<{ status: "retired" }> {
    return this.setStatus(questionId, "retired");
  }

  restore(questionId: string): Promise<{ status: "active" }> {
    return this.setStatus(questionId, "active");
  }

  listSubtopics(input: { examType: ExamType; topic?: string }): Promise<readonly Subtopic[]> {
    return this.deps.store.listSubtopics(input.examType, input.topic);
  }

  async createSubtopic(input: Scope & { name: string }): Promise<Subtopic> {
    return this.deps.store.createSubtopic({
      examType: input.examType,
      topic: requireText(input.topic, "topic"),
      name: subtopicName(input.name),
    });
  }

  async renameSubtopic(id: string, name: string): Promise<{ renamed: true }> {
    if (!(await this.deps.store.renameSubtopic(id, subtopicName(name)))) throw subtopicNotFound();
    return { renamed: true };
  }

  /** Questions in the subtopic keep existing; the database clears their link to it. */
  async deleteSubtopic(id: string): Promise<{ deleted: true }> {
    if (!(await this.deps.store.deleteSubtopic(id))) throw subtopicNotFound();
    return { deleted: true };
  }

  private async insert(
    adminId: string,
    input: { examType: ExamType; topic: string; questions: readonly NewQuestionContent[] },
  ): Promise<{ created: number }> {
    const topic = requireText(input.topic, "topic");
    if (input.questions.length === 0) throw new ValidationError("There are no questions to add.");
    if (input.questions.length > MAX_IMPORT) {
      throw new ValidationError(`Add at most ${MAX_IMPORT} questions at a time.`);
    }
    const problems = input.questions.flatMap((question, index) => {
      const issues = questionIssues(question);
      return issues.length === 0 ? [] : [`Question ${index + 1} is missing: ${issues.join(", ")}.`];
    });
    if (problems.length > 0) {
      throw new ValidationError(problems.slice(0, MAX_REPORTED_PROBLEMS).join(" "));
    }
    const created = await this.deps.store.insertMany(
      input.questions.map((question) => ({
        ...normalised(question),
        exam_type: input.examType,
        topic,
        created_by: adminId,
      })),
    );
    return { created };
  }

  private async assertSubtopicFits(questionId: string, subtopicId: string): Promise<void> {
    const question = await this.deps.store.questionScope(questionId);
    if (question === null) throw questionNotFound();
    const subtopic = await this.deps.store.subtopicScope(subtopicId);
    if (subtopic === null) throw subtopicNotFound();
    if (subtopic.examType !== question.examType || subtopic.topic !== question.topic) {
      throw new ValidationError("That subtopic belongs to a different exam type or topic.");
    }
  }

  private async setStatus<S extends QuestionStatus>(
    questionId: string,
    status: S,
  ): Promise<{ status: S }> {
    if (!(await this.deps.store.setStatus(questionId, status))) throw questionNotFound();
    return { status };
  }
}

function normalised(content: NewQuestionContent): NewQuestionContent {
  const rationale = content.rationale?.trim() ?? "";
  return {
    question_text: content.question_text.trim(),
    option_a: content.option_a.trim(),
    option_b: content.option_b.trim(),
    option_c: content.option_c.trim(),
    option_d: content.option_d.trim(),
    correct_answer: content.correct_answer.trim().toUpperCase(),
    rationale: rationale === "" ? null : rationale,
  };
}

function requireText(value: string, what: string): string {
  const text = value.trim();
  if (text === "") throw new ValidationError(`Enter a ${what}.`);
  return text;
}

function subtopicName(name: string): string {
  const text = requireText(name, "subtopic name");
  if (text.length > MAX_SUBTOPIC_NAME) {
    throw new ValidationError(`A subtopic name has at most ${MAX_SUBTOPIC_NAME} characters.`);
  }
  return text;
}

const questionNotFound = () => new NotFoundError("Question not found.");
const subtopicNotFound = () => new NotFoundError("Subtopic not found.");
