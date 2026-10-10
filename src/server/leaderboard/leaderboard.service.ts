export type LeaderboardPeriod = "daily" | "weekly";

/** A board row as the database gives it. The user id never leaves the server. */
export interface LeaderboardRow {
  readonly userId: string;
  readonly username: string | null;
  readonly avgScore: number;
  readonly attempted: number;
  readonly correct: number;
  /** Weekly board only. */
  readonly activeDays: number | null;
}

export interface LeaderboardEntry {
  readonly rank: number;
  readonly username: string;
  readonly avgScore: number;
  readonly attempted: number;
  readonly correct: number;
  readonly activeDays: number | null;
  readonly isYou: boolean;
}

interface Dependencies {
  readonly store: {
    daily(): Promise<readonly LeaderboardRow[]>;
    weekly(): Promise<readonly LeaderboardRow[]>;
  };
}

/**
 * The daily and weekly boards. The database ranks and bounds them (50 and 100 rows); this service
 * turns rows into what a browser may see: a rank, a display name and whether the row is the caller's.
 */
export class LeaderboardService {
  constructor(private readonly deps: Dependencies) {}

  async get(
    userId: string,
    input: { period: LeaderboardPeriod },
  ): Promise<{ period: LeaderboardPeriod; entries: LeaderboardEntry[] }> {
    const rows =
      input.period === "daily" ? await this.deps.store.daily() : await this.deps.store.weekly();
    return {
      period: input.period,
      entries: rows.map((row, index) => ({
        rank: index + 1,
        username: row.username ?? "Anonymous",
        avgScore: row.avgScore,
        attempted: row.attempted,
        correct: row.correct,
        activeDays: row.activeDays,
        isYou: row.userId === userId,
      })),
    };
  }
}
