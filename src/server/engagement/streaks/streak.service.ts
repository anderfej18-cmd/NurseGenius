import { STREAK_CONFIG, type StreakConfig } from "./streak.config";
import { computeStreak, type StreakReport, type StudyDay } from "./streak";

/** What this service needs from the rest of the system; declared here, next to its only consumer. */
interface Dependencies {
  readonly store: { listStudyDays(userId: string, since: string): Promise<readonly StudyDay[]> };
  readonly clock: () => Date;
  readonly config?: StreakConfig;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Reads a student's study days and works out their streak. */
export class StreakService {
  private readonly config: StreakConfig;

  constructor(private readonly deps: Dependencies) {
    this.config = deps.config ?? STREAK_CONFIG;
  }

  async get(userId: string): Promise<StreakReport> {
    const now = this.deps.clock();
    const since = new Date(now.getTime() - this.config.windowDays * DAY_MS);
    const days = await this.deps.store.listStudyDays(userId, since.toISOString().slice(0, 10));
    return computeStreak(days, now, this.config);
  }
}
