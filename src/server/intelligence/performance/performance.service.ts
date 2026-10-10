import type { AttemptRecord } from "../attempt.types";
import { analyzePerformance, type PerformanceReport } from "./performance";

/** What this service needs from the rest of the system; declared here, next to its only consumer. */
interface Dependencies {
  readonly history: { load(userId: string): Promise<readonly AttemptRecord[]> };
  readonly reviews: { countDue(userId: string): Promise<number> };
  readonly store: {
    countUnresolvedMistakes(userId: string): Promise<number>;
    /** Completed tests whose stored score is not verified (docs/audits/fix-pass.md, L4). */
    countUnverifiedExams(userId: string): Promise<number>;
  };
  readonly clock: () => Date;
}

/** Measures one student's learning patterns from their own recorded answers; the analysis is `analyzePerformance`. */
export class PerformanceService {
  constructor(private readonly deps: Dependencies) {}

  async analyze(userId: string): Promise<PerformanceReport> {
    const { history, reviews, store, clock } = this.deps;
    const [attempts, dueReviews, unresolvedMistakes, unverifiedExams] = await Promise.all([
      history.load(userId),
      reviews.countDue(userId),
      store.countUnresolvedMistakes(userId),
      store.countUnverifiedExams(userId),
    ]);
    return analyzePerformance({
      now: clock(),
      attempts,
      dueReviews,
      unresolvedMistakes,
      unverifiedExams,
    });
  }
}
