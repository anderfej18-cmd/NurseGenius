import { describe, expect, it, vi } from "vitest";
import type { AchievementUnlock } from "./achievements";
import {
  GamificationService,
  type SessionCounters,
  type XpLedgerEntry,
} from "./gamification.service";
import type { ChallengeXpFacts, SessionXpFacts, XpEventDraft } from "./xp";

const NOW = new Date("2026-10-10T12:00:00.000Z");
const USER = "user-1";

const session = (id: string, overrides: Partial<SessionXpFacts> = {}): SessionXpFacts => ({
  examId: id,
  completedAt: new Date("2026-10-09T10:00:00.000Z"),
  sessionType: "mixed",
  answered: 6,
  correct: 3,
  firstCorrect: 2,
  ...overrides,
});

interface Setup {
  sessions?: SessionXpFacts[];
  startingXp?: number;
  unlocked?: string[];
  counters?: Partial<SessionCounters>;
  longestStreak?: number;
  /** Codes the database reports as newly inserted; defaults to all that were offered. */
  insertedOverride?: string[];
  challenges?: ChallengeXpFacts[];
}

/** An in-memory store with the ledger's rules: a source is paid once, a processed session is not listed again. */
function setup(options: Setup = {}) {
  const events = new Map<string, XpEventDraft>();
  const sessions = [...(options.sessions ?? [])];
  const unlocked = new Map((options.unlocked ?? []).map((code) => [code, NOW]));
  const baseXp = options.startingXp ?? 0;
  const key = (e: Pick<XpEventDraft, "sourceType" | "sourceId">) => `${e.sourceType}:${e.sourceId}`;
  const total = () => baseXp + [...events.values()].reduce((sum, e) => sum + e.xp, 0);

  const store = {
    listUnawardedSessions: vi.fn(async (_user: string, limit: number) =>
      sessions.filter((s) => !events.has(`session:${s.examId}`)).slice(0, limit),
    ),
    recordXpEvents: vi.fn(async (_user: string, drafts: readonly XpEventDraft[]) => {
      let added = 0;
      for (const draft of drafts) {
        if (!events.has(key(draft))) {
          events.set(key(draft), draft);
          added += 1;
        }
      }
      return added;
    }),
    listUnpaidChallenges: vi.fn(async (_user: string, limit: number) =>
      (options.challenges ?? [])
        .filter((c) => !events.has(`daily_challenge:${c.challengeId}`))
        .slice(0, limit),
    ),
    getTotalXp: vi.fn(async () => total()),
    getCounters: vi.fn(async () => ({
      sessions_completed: sessions.length,
      questions_answered: 0,
      correct_answers: 0,
      perfect_sessions: 0,
      topics_practised: 0,
      daily_challenges_completed: (options.challenges ?? []).length,
      ...options.counters,
    })),
    listAchievements: vi.fn(async () =>
      [...unlocked].map(([code, unlockedAt]) => ({ code, unlockedAt })),
    ),
    unlockAchievements: vi.fn(
      async (_user: string, offered: ReadonlyArray<AchievementUnlock & { unlockedAt: Date }>) => {
        const inserted = options.insertedOverride ?? offered.map((o) => o.code);
        for (const o of offered) {
          if (!inserted.includes(o.code)) continue;
          unlocked.set(o.code, o.unlockedAt);
          events.set(`achievement:${o.code}`, {
            sourceType: "achievement",
            sourceId: o.code,
            xp: o.xp,
            occurredAt: o.unlockedAt,
          });
        }
        return inserted;
      },
    ),
    listXpEvents: vi.fn(
      async (_user: string, _page: { limit: number; offset: number }): Promise<XpLedgerEntry[]> => [
        { sourceType: "session", sourceId: "s", xp: 20, occurredAt: NOW },
      ],
    ),
  };
  const streaks = {
    get: vi.fn(async (_user: string) => ({ longest: options.longestStreak ?? 0 })),
  };
  const service = new GamificationService({ store, streaks, clock: () => NOW });
  return { service, store, streaks, total };
}

describe("GamificationService.sync", () => {
  it("pays XP for finished sessions and marks them processed", async () => {
    const { service, store, total } = setup({ sessions: [session("a"), session("b")] });
    const result = await service.sync(USER);

    // Each session: 2 first-time correct × 10 + the daily bonus once for the day = 40 + 20.
    expect(total()).toBe(2 * 20 + 20 + 25); // sessions 40, daily bonus 20, first_session achievement 25
    expect(result.sessionsProcessed).toBe(2);
    expect(store.listUnawardedSessions).toHaveBeenCalledWith(USER, 50);
  });

  it("pays nothing the second time", async () => {
    const { service, total } = setup({ sessions: [session("a")] });
    await service.sync(USER);
    const after = total();
    const again = await service.sync(USER);
    expect(total()).toBe(after);
    expect(again).toMatchObject({ xpAwarded: 0, sessionsProcessed: 0, unlocked: [] });
  });

  it("works through many sessions in batches", async () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      session(`s-${i}`, { firstCorrect: 0, answered: 1, correct: 0 }),
    );
    const { service, store } = setup({ sessions: many });
    const result = await service.sync(USER);
    expect(result.sessionsProcessed).toBe(120);
    expect(store.listUnawardedSessions).toHaveBeenCalledTimes(3);
  });

  it("unlocks achievements the counters have earned, and reports them once", async () => {
    const { service } = setup({ sessions: [session("a")] });
    const first = await service.sync(USER);
    expect(first.unlocked.map((a) => a.code)).toEqual(["first_session"]);
    expect((await service.sync(USER)).unlocked).toEqual([]);
  });

  it("takes the longest streak from the streak service", async () => {
    const { service, streaks } = setup({ longestStreak: 7 });
    const result = await service.sync(USER);
    expect(result.unlocked.map((a) => a.code)).toEqual(["streak_3", "streak_7"]);
    expect(streaks.get).toHaveBeenCalledWith(USER);
  });

  it("detects a level gained, including from achievement XP", async () => {
    // Session pays 10 first-time answers × 10 + 20 daily = 120 → level 2 (100 XP).
    const { service } = setup({
      sessions: [session("a", { firstCorrect: 10, answered: 10, correct: 5 })],
    });
    const result = await service.sync(USER);
    expect(result).toMatchObject({ levelBefore: 1, leveledUp: true });
    expect(result.levelAfter).toBeGreaterThanOrEqual(2);
  });

  it("lets an achievement's XP lift the level and unlock the next achievement in the same sync", async () => {
    // 960 XP + 40 from the session = 1000 → level 5 → "level_5" unlocks and pays 100 more.
    const { service } = setup({
      startingXp: 960,
      unlocked: ["first_session"],
      sessions: [session("a", { firstCorrect: 4, answered: 4, correct: 4 })],
      counters: { sessions_completed: 5 },
    });
    const result = await service.sync(USER);
    expect(result.unlocked.map((a) => a.code)).toEqual(["level_5"]);
    expect(result.levelAfter).toBe(5);
  });

  it("does not claim an achievement the database says another request already unlocked", async () => {
    const { service } = setup({ sessions: [session("a")], insertedOverride: [] });
    expect((await service.sync(USER)).unlocked).toEqual([]);
  });

  it("keeps working for a student with no history", async () => {
    const { service } = setup();
    expect(await service.sync(USER)).toMatchObject({
      xpAwarded: 0,
      sessionsProcessed: 0,
      unlocked: [],
    });
  });

  it("only ever asks about the given student", async () => {
    const { service, store } = setup({ sessions: [session("a")] });
    await service.sync("user-7");
    for (const mock of Object.values(store)) {
      for (const call of mock.mock.calls) expect(call[0]).toBe("user-7");
    }
  });
});

describe("GamificationService.sync: daily challenges", () => {
  const done = (id: string, correct: number): ChallengeXpFacts => ({
    challengeId: id,
    completedAt: new Date("2026-10-09T10:00:00.000Z"),
    correct,
    total: 5,
  });

  it("pays for each finished challenge once", async () => {
    const { service, total } = setup({ challenges: [done("c1", 5)] });
    await service.sync(USER);
    // 5 × 8 + 10 for the challenge, plus the daily_challenge_1 achievement (see below).
    expect(total()).toBe(50 + 40);
    const after = total();
    await service.sync(USER);
    expect(total()).toBe(after);
  });

  it("unlocks the first-challenge achievement from the counter", async () => {
    const { service } = setup({ challenges: [done("c1", 2)] });
    expect((await service.sync(USER)).unlocked.map((a) => a.code)).toContain("daily_challenge_1");
  });

  it("works through challenges in batches", async () => {
    const many = Array.from({ length: 120 }, (_, i) => done(`c${i}`, 0));
    const { service, store } = setup({ challenges: many });
    await service.sync(USER);
    expect(store.listUnpaidChallenges).toHaveBeenCalledTimes(3);
  });
});

describe("GamificationService.summary", () => {
  it("catches up first, then reports XP, level, achievements with progress, and recent XP", async () => {
    const { service, store } = setup({ sessions: [session("a")] });
    const summary = await service.summary(USER);

    expect(store.listUnawardedSessions).toHaveBeenCalled();
    // 2 first-time answers × 10, the daily bonus 20, and the first_session achievement 25.
    expect(summary.totalXp).toBe(20 + 20 + 25);
    expect(summary.level).toMatchObject({ level: 1, totalXp: 65 });
    expect(summary.achievements.find((a) => a.code === "first_session")).toMatchObject({
      unlocked: true,
      unlockedAt: NOW,
    });
    expect(summary.achievements.find((a) => a.code === "sessions_10")).toMatchObject({
      unlocked: false,
      current: 1,
      target: 10,
      progress: 0.1,
    });
    expect(summary.recent).toHaveLength(1);
  });
});

describe("GamificationService.history", () => {
  it("pages the ledger, newest first, with a next offset", async () => {
    const { service, store } = setup();
    store.listXpEvents.mockResolvedValueOnce(
      Array.from({ length: 3 }, (_, i) => ({
        sourceType: "session" as const,
        sourceId: `s${i}`,
        xp: 10,
        occurredAt: NOW,
      })),
    );
    const page = await service.history(USER, { limit: 2, offset: 4 });
    expect(store.listXpEvents).toHaveBeenCalledWith(USER, { limit: 3, offset: 4 });
    expect(page.items).toHaveLength(2);
    expect(page.nextOffset).toBe(6);
  });
});
