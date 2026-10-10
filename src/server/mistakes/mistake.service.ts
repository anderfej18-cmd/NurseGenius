import { offsetBounds, toOffsetPage } from "../pagination";
import type { OffsetPage } from "../types";
import { RECENT_MISTAKE_DAYS, REPEATED_MISS_THRESHOLD } from "./mistake.config";
import type {
  MistakeItem,
  MistakeQuery,
  MistakeRequest,
  MistakeRow,
  MistakeSpec,
  MistakeView,
} from "./mistake.types";

export interface MistakeRepository {
  /** Only ever this student's rows. */
  list(userId: string, query: MistakeQuery): Promise<MistakeRow[]>;
  /** Questions in the student's running (unsubmitted) exam. */
  activeSessionQuestionIds(userId: string): Promise<string[]>;
}

interface Dependencies {
  repository: MistakeRepository;
  clock: () => Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export class MistakeService {
  constructor(private readonly deps: Dependencies) {}

  async list(userId: string, request: MistakeRequest): Promise<OffsetPage<MistakeItem>> {
    const { offset, limit } = offsetBounds(request);

    const { repository } = this.deps;
    const [rows, active] = await Promise.all([
      repository.list(userId, {
        spec: this.specFor(request.view),
        examType: request.examType,
        topic: request.topic,
        limit: limit + 1,
        offset,
      }),
      repository.activeSessionQuestionIds(userId),
    ]);

    const withheld = new Set(active);
    const page = toOffsetPage(rows, limit, offset);
    return { ...page, items: page.items.map((row) => toItem(row, withheld.has(row.questionId))) };
  }

  private specFor(view: MistakeView): MistakeSpec {
    switch (view) {
      case "all":
        return { sort: "recent", minMisses: 1, unresolvedOnly: false, since: null };
      case "most_repeated":
        return { sort: "most_missed", minMisses: 1, unresolvedOnly: false, since: null };
      case "recent":
        return {
          sort: "recent",
          minMisses: 1,
          unresolvedOnly: false,
          since: new Date(this.deps.clock().getTime() - RECENT_MISTAKE_DAYS * DAY_MS).toISOString(),
        };
      case "repeatedly_failed":
        return {
          sort: "most_missed",
          minMisses: REPEATED_MISS_THRESHOLD,
          unresolvedOnly: true,
          since: null,
        };
    }
  }
}

function toItem(row: MistakeRow, withheld: boolean): MistakeItem {
  return {
    questionId: row.questionId,
    examType: row.question.exam_type,
    topic: row.question.topic,
    misses: row.misses,
    attempts: row.attempts,
    correct: row.correct,
    lastMissedAt: row.lastMissedAt,
    lastAnswer: row.lastAnswer,
    unresolved: row.unresolved,
    answerWithheld: withheld,
    question: {
      question_text: row.question.question_text,
      option_a: row.question.option_a,
      option_b: row.question.option_b,
      option_c: row.question.option_c,
      option_d: row.question.option_d,
      correct_answer: withheld ? null : row.question.correct_answer,
      rationale: withheld ? null : row.question.rationale,
    },
  };
}
