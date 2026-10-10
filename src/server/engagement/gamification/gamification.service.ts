import { offsetBounds, toOffsetPage } from "../../pagination";
import type { OffsetPage } from "../../types";
import {
  type AchievementProgress,
  type AchievementUnlock,
  type EngagementSnapshot,
  achievementProgress,
  evaluateAchievements,
} from "./achievements";
import {
  GAMIFICATION_CONFIG,
  GAMIFICATION_SYNC,
  type GamificationConfig,
} from "./gamification.config";
import { type LevelProgress, levelFromXp } from "./levels";
import {
  type ChallengeXpFacts,
  type SessionXpFacts,
  type XpEventDraft,
  xpEventForChallenge,
  xpEventsForSession,
} from "./xp";

/** The counters the database can count; the server adds the streak and the level. */
export type SessionCounters = Omit<EngagementSnapshot, "longest_streak" | "level">;

export interface XpLedgerEntry {
  readonly sourceType: XpEventDraft["sourceType"];
  readonly sourceId: string;
  readonly xp: number;
  readonly occurredAt: Date;
}

/** What this service needs from the rest of the system; declared here, next to its only consumer. */
interface Dependencies {
  readonly store: {
    listUnawardedSessions(userId: string, limit: number): Promise<readonly SessionXpFacts[]>;
    listUnpaidChallenges(userId: string, limit: number): Promise<readonly ChallengeXpFacts[]>;
    recordXpEvents(userId: string, events: readonly XpEventDraft[]): Promise<number>;
    getTotalXp(userId: string): Promise<number>;
    getCounters(
      userId: string,
      thresholds: { perfectMinAnswered: number; topicMinAttempts: number },
    ): Promise<SessionCounters>;
    listAchievements(userId: string): Promise<ReadonlyArray<{ code: string; unlockedAt: Date }>>;
    /** Returns the codes the database actually inserted (the rest were already unlocked). */
    unlockAchievements(
      userId: string,
      unlocks: ReadonlyArray<AchievementUnlock & { unlockedAt: Date }>,
    ): Promise<readonly string[]>;
    listXpEvents(
      userId: string,
      page: { limit: number; offset: number },
    ): Promise<readonly XpLedgerEntry[]>;
  };
  readonly streaks: { get(userId: string): Promise<{ longest: number }> };
  readonly clock: () => Date;
  readonly config?: GamificationConfig;
}

export interface SyncResult {
  readonly sessionsProcessed: number;
  readonly xpAwarded: number;
  readonly levelBefore: number;
  readonly levelAfter: number;
  readonly leveledUp: boolean;
  /** Achievements this call unlocked, in order. */
  readonly unlocked: readonly AchievementUnlock[];
}

export interface GamificationSummary {
  readonly totalXp: number;
  readonly level: LevelProgress;
  readonly achievements: ReadonlyArray<AchievementProgress & { readonly unlockedAt: Date | null }>;
  readonly recent: readonly XpLedgerEntry[];
}

/**
 * XP, levels and achievements, all derived from what the server has recorded. Every payment has a
 * unique source in the ledger, so catching up is safe to repeat; nothing here accepts an amount from
 * a client. Rules in docs/formulas.md (section 11).
 */
export class GamificationService {
  private readonly config: GamificationConfig;

  constructor(private readonly deps: Dependencies) {
    this.config = deps.config ?? GAMIFICATION_CONFIG;
  }

  /** Works out XP for sessions not yet paid, then unlocks any achievements now earned. */
  async sync(userId: string): Promise<SyncResult> {
    return (await this.catchUp(userId)).result;
  }

  async summary(userId: string): Promise<GamificationSummary> {
    const { store } = this.deps;
    const { snapshot } = await this.catchUp(userId);
    const [totalXp, unlocked, recent] = await Promise.all([
      store.getTotalXp(userId),
      store.listAchievements(userId),
      store.listXpEvents(userId, { limit: GAMIFICATION_SYNC.recentEvents, offset: 0 }),
    ]);
    const unlockedAt = new Map(unlocked.map(({ code, unlockedAt: at }) => [code, at]));
    return {
      totalXp,
      level: levelFromXp(totalXp, this.config.levels),
      achievements: achievementProgress(snapshot, [...unlockedAt.keys()], this.config).map((a) => ({
        ...a,
        unlockedAt: unlockedAt.get(a.code) ?? null,
      })),
      recent,
    };
  }

  async history(
    userId: string,
    request: { limit?: number; offset?: number },
  ): Promise<OffsetPage<XpLedgerEntry>> {
    const { offset, limit } = offsetBounds(request);
    const rows = await this.deps.store.listXpEvents(userId, { limit: limit + 1, offset });
    return toOffsetPage([...rows], limit, offset);
  }

  private async catchUp(
    userId: string,
  ): Promise<{ result: SyncResult; snapshot: EngagementSnapshot }> {
    const { store } = this.deps;
    const before = await store.getTotalXp(userId);
    const sessionsProcessed = await this.payForSessions(userId);
    await this.payForChallenges(userId);
    const { unlocked, snapshot } = await this.unlockAchievements(userId);
    const after = await store.getTotalXp(userId);

    const levelBefore = levelFromXp(before, this.config.levels).level;
    const levelAfter = levelFromXp(after, this.config.levels).level;
    return {
      result: {
        sessionsProcessed,
        xpAwarded: after - before,
        levelBefore,
        levelAfter,
        leveledUp: levelAfter > levelBefore,
        unlocked,
      },
      snapshot,
    };
  }

  private payForSessions(userId: string): Promise<number> {
    const { store } = this.deps;
    return this.payInBatches(
      (limit) => store.listUnawardedSessions(userId, limit),
      (sessions) => sessions.flatMap((facts) => xpEventsForSession(facts, this.config)),
      userId,
    );
  }

  private payForChallenges(userId: string): Promise<number> {
    const { store } = this.deps;
    return this.payInBatches(
      (limit) => store.listUnpaidChallenges(userId, limit),
      (challenges) => challenges.map((facts) => xpEventForChallenge(facts, this.config)),
      userId,
    );
  }

  /** Pays unprocessed items a batch at a time, up to a fixed number of batches per request. */
  private async payInBatches<T>(
    list: (limit: number) => Promise<readonly T[]>,
    toEvents: (items: readonly T[]) => XpEventDraft[],
    userId: string,
  ): Promise<number> {
    const { batchSize, maxBatches } = GAMIFICATION_SYNC;
    let processed = 0;
    for (let batch = 0; batch < maxBatches; batch += 1) {
      const items = await list(batchSize);
      if (items.length === 0) break;
      await this.deps.store.recordXpEvents(userId, toEvents(items));
      processed += items.length;
      if (items.length < batchSize) break;
    }
    return processed;
  }

  /** Repeats while new achievements keep lifting the level, up to a fixed number of rounds. */
  private async unlockAchievements(
    userId: string,
  ): Promise<{ unlocked: AchievementUnlock[]; snapshot: EngagementSnapshot }> {
    const { store, clock } = this.deps;
    const unlocked: AchievementUnlock[] = [];
    let snapshot = await this.snapshot(userId);
    for (let round = 0; round < GAMIFICATION_SYNC.maxAchievementRounds; round += 1) {
      const have = await store.listAchievements(userId);
      const fresh = evaluateAchievements(
        snapshot,
        have.map(({ code }) => code),
        this.config,
      );
      if (fresh.length === 0) break;

      const now = clock();
      const inserted = new Set(
        await store.unlockAchievements(
          userId,
          fresh.map((a) => ({ ...a, unlockedAt: now })),
        ),
      );
      unlocked.push(...fresh.filter((a) => inserted.has(a.code)));
      if (inserted.size === 0) break;
      snapshot = await this.snapshot(userId);
    }
    return { unlocked, snapshot };
  }

  private async snapshot(userId: string): Promise<EngagementSnapshot> {
    const { store, streaks } = this.deps;
    const [counters, totalXp, streak] = await Promise.all([
      store.getCounters(userId, {
        perfectMinAnswered: this.config.xp.perfectSession.minAnswered,
        topicMinAttempts: this.config.topicPractisedMinAttempts,
      }),
      store.getTotalXp(userId),
      streaks.get(userId),
    ]);
    return {
      ...counters,
      longest_streak: streak.longest,
      level: levelFromXp(totalXp, this.config.levels).level,
    };
  }
}
