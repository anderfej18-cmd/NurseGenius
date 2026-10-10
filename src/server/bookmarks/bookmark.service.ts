import { LimitReachedError, NotFoundError, ValidationError } from "../errors";
import { offsetBounds, toOffsetPage } from "../pagination";
import type { OffsetPage } from "../types";
import {
  MAX_BOOKMARKS_PER_STUDENT,
  type BookmarkItem,
  type BookmarkListRequest,
  type BookmarkQuery,
  type BookmarkRow,
} from "./bookmark.types";

const MAX_NOTE_LENGTH = 500;

export interface BookmarkRepository {
  questionIsActive(questionId: string): Promise<boolean>;
  has(userId: string, questionId: string): Promise<boolean>;
  count(userId: string): Promise<number>;
  /** Insert or update the student's bookmark; unique on (user, question). */
  upsert(userId: string, questionId: string, note: string | null): Promise<void>;
  remove(userId: string, questionId: string): Promise<boolean>;
  list(userId: string, query: BookmarkQuery): Promise<BookmarkRow[]>;
}

export class BookmarkService {
  constructor(private readonly repository: BookmarkRepository) {}

  async add(userId: string, input: { questionId: string; note?: string }): Promise<{ ok: true }> {
    const note = input.note?.trim() || null;
    if (note !== null && note.length > MAX_NOTE_LENGTH) {
      throw new ValidationError(`Notes can be at most ${MAX_NOTE_LENGTH} characters.`);
    }
    if (!(await this.repository.questionIsActive(input.questionId)))
      throw new NotFoundError("Question not found.");

    const alreadyBookmarked = await this.repository.has(userId, input.questionId);
    if (!alreadyBookmarked && (await this.repository.count(userId)) >= MAX_BOOKMARKS_PER_STUDENT) {
      throw new LimitReachedError(`You can bookmark up to ${MAX_BOOKMARKS_PER_STUDENT} questions.`);
    }
    await this.repository.upsert(userId, input.questionId, note);
    return { ok: true };
  }

  async remove(userId: string, questionId: string): Promise<{ removed: boolean }> {
    return { removed: await this.repository.remove(userId, questionId) };
  }

  async list(userId: string, request: BookmarkListRequest): Promise<OffsetPage<BookmarkItem>> {
    const { offset, limit } = offsetBounds(request);

    const rows = await this.repository.list(userId, {
      examType: request.examType,
      topic: request.topic,
      limit: limit + 1,
      offset,
    });
    const page = toOffsetPage(rows, limit, offset);
    return { ...page, items: page.items.map(toItem) };
  }
}

function toItem(row: BookmarkRow): BookmarkItem {
  return {
    questionId: row.questionId,
    note: row.note,
    createdAt: row.createdAt,
    examType: row.question.exam_type,
    topic: row.question.topic,
    question: {
      question_text: row.question.question_text,
      option_a: row.question.option_a,
      option_b: row.question.option_b,
      option_c: row.question.option_c,
      option_d: row.question.option_d,
    },
  };
}
