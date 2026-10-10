import type { AttemptRecord } from "./attempt.types";
import { resolveDifficulty, type OutcomeCounts } from "./difficulty";

/** What this service needs from the data layer; declared here, next to its only consumer. */
export interface AttemptSource {
  list(userId: string, options: { since?: Date; limit?: number }): Promise<AttemptRecord[]>;
  questionStats(questionIds: readonly string[]): Promise<Map<string, OutcomeCounts>>;
}

/**
 * A student's attempt history with difficulty filled in, ready for the engines. Difficulty comes
 * from the admin-set value when there is one, else from how all students fared, else stays unknown.
 */
export class LearningHistoryService {
  constructor(private readonly source: AttemptSource) {}

  async load(
    userId: string,
    options: { since?: Date; limit?: number } = {},
  ): Promise<AttemptRecord[]> {
    const attempts = await this.source.list(userId, options);
    const withoutDifficulty = [
      ...new Set(attempts.filter((a) => a.difficulty === null).map((a) => a.questionId)),
    ];
    if (withoutDifficulty.length === 0) return attempts;

    const stats = await this.source.questionStats(withoutDifficulty);
    return attempts.map((attempt) =>
      attempt.difficulty === null
        ? { ...attempt, difficulty: resolveDifficulty(null, stats.get(attempt.questionId)) }
        : attempt,
    );
  }
}
