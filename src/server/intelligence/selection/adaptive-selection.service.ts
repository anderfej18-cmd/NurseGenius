import type { SelectionReason } from "@/lib/session-modes";
import type { AttemptSignal } from "../attempt.types";
import type { MasteryService } from "../mastery/mastery.service";
import {
  AdaptiveSelector,
  type CandidateQuestion,
  type QuestionProgress,
} from "./adaptive-selector";

/** What this service needs from the rest of the system; declared here, next to its only consumer. */
interface Dependencies {
  readonly history: { load(userId: string): Promise<readonly AttemptSignal[]> };
  readonly progress: {
    listProgress(userId: string): Promise<ReadonlyMap<string, QuestionProgress>>;
  };
  readonly reviews: { refreshStale(userId: string): Promise<number> };
  readonly mastery: MasteryService;
  readonly selector?: AdaptiveSelector;
  readonly clock: () => Date;
}

/**
 * Chooses which questions a student practises next from a pool of candidates, using only what the
 * student's own history shows. The server calls this; the browser never names the questions.
 */
export class AdaptiveSelectionService {
  private readonly selector: AdaptiveSelector;

  constructor(private readonly deps: Dependencies) {
    this.selector = deps.selector ?? new AdaptiveSelector();
  }

  /** The `count` questions from `pool` most worth practising now, best first; fewer if the pool is smaller. */
  async pick<C extends CandidateQuestion>(
    userId: string,
    pool: readonly C[],
    count: number,
  ): Promise<C[]> {
    return (await this.pickWithReasons(userId, pool, count)).map((entry) => entry.question);
  }

  /** The same choice, each question with the signal that put it there. */
  async pickWithReasons<C extends CandidateQuestion>(
    userId: string,
    pool: readonly C[],
    count: number,
  ): Promise<Array<{ question: C; reason: SelectionReason }>> {
    if (pool.length === 0 || count <= 0) return [];

    // Schedules first, so "due" reflects every exam the student has completed.
    await this.deps.reviews.refreshStale(userId);
    const [attempts, progress] = await Promise.all([
      this.deps.history.load(userId),
      this.deps.progress.listProgress(userId),
    ]);

    const now = this.deps.clock();
    const { topics } = this.deps.mastery.analyze(attempts, now);
    const selected = this.selector.select(pool, count, {
      now,
      topics: new Map(topics.map((topic) => [topic.topic, topic])),
      progress,
      seed: `${userId}|${now.toISOString()}`,
    });
    return selected.map(({ question, reason }) => ({ question, reason }));
  }
}
