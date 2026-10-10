import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "../../testing/fake-supabase";
import { SupabaseGamificationStore } from "./gamification.repository.server";

const USER = "user-1";
const rpcArgs = (fake: ReturnType<typeof createFakeSupabase>, fn: string) =>
  fake.callsOn(`rpc:${fn}`, "args")[0].args[0];
const chain = (fake: ReturnType<typeof createFakeSupabase>, index = 0) =>
  fake.recorded[index].chain.map((c) => [c.method, ...c.args]);

describe("SupabaseGamificationStore: sessions and XP", () => {
  it("asks for this student's unpaid sessions and maps the rows", async () => {
    const fake = createFakeSupabase([
      {
        data: [
          {
            exam_id: "e1",
            completed_at: "2026-10-09T10:00:00.000Z",
            session_type: "mixed",
            answered: 6,
            correct: 3,
            first_correct: 2,
          },
        ],
      },
    ]);
    const rows = await new SupabaseGamificationStore(fake.client).listUnawardedSessions(USER, 50);
    expect(rpcArgs(fake, "get_unawarded_sessions")).toEqual({ _user_id: USER, _limit: 50 });
    expect(rows).toEqual([
      {
        examId: "e1",
        completedAt: new Date("2026-10-09T10:00:00.000Z"),
        sessionType: "mixed",
        answered: 6,
        correct: 3,
        firstCorrect: 2,
      },
    ]);
  });

  it("sends XP events in the database's shape and returns how many were new", async () => {
    const fake = createFakeSupabase([{ data: 2 }]);
    const added = await new SupabaseGamificationStore(fake.client).recordXpEvents(USER, [
      {
        sourceType: "session",
        sourceId: "e1",
        xp: 20,
        occurredAt: new Date("2026-10-09T10:00:00.000Z"),
      },
    ]);
    expect(added).toBe(2);
    expect(rpcArgs(fake, "record_xp_events")).toEqual({
      _user_id: USER,
      _events: [
        {
          source_type: "session",
          source_id: "e1",
          xp: 20,
          occurred_at: "2026-10-09T10:00:00.000Z",
        },
      ],
    });
  });

  it("reads the total XP of the student", async () => {
    const fake = createFakeSupabase([{ data: 1234 }]);
    expect(await new SupabaseGamificationStore(fake.client).getTotalXp(USER)).toBe(1234);
    expect(rpcArgs(fake, "get_xp_total")).toEqual({ _user_id: USER });
  });

  it("passes the server's thresholds with the counters request and checks the reply", async () => {
    const counters = {
      sessions_completed: 3,
      questions_answered: 40,
      correct_answers: 30,
      perfect_sessions: 1,
      topics_practised: 2,
      daily_challenges_completed: 4,
    };
    const fake = createFakeSupabase([{ data: counters }]);
    const result = await new SupabaseGamificationStore(fake.client).getCounters(USER, {
      perfectMinAnswered: 10,
      topicMinAttempts: 5,
    });
    expect(rpcArgs(fake, "get_engagement_snapshot")).toEqual({
      _user_id: USER,
      _perfect_min_answered: 10,
      _topic_min_attempts: 5,
    });
    expect(result).toEqual(counters);
  });

  it("fails loudly on counters the database should never produce", async () => {
    const fake = createFakeSupabase([{ data: { sessions_completed: -1 } }]);
    await expect(
      new SupabaseGamificationStore(fake.client).getCounters(USER, {
        perfectMinAnswered: 10,
        topicMinAttempts: 5,
      }),
    ).rejects.toThrow();
  });
});

describe("SupabaseGamificationStore: daily challenges", () => {
  it("asks for this student's finished challenges that were not paid yet", async () => {
    const fake = createFakeSupabase([
      {
        data: [
          {
            challenge_id: "c1",
            completed_at: "2026-10-09T10:00:00.000Z",
            correct_count: 4,
            total_questions: 5,
            score_pct: "80.00",
          },
        ],
      },
    ]);
    const rows = await new SupabaseGamificationStore(fake.client).listUnpaidChallenges(USER, 50);
    expect(rpcArgs(fake, "get_unpaid_daily_challenges")).toEqual({ _user_id: USER, _limit: 50 });
    expect(rows).toEqual([
      {
        challengeId: "c1",
        completedAt: new Date("2026-10-09T10:00:00.000Z"),
        correct: 4,
        total: 5,
      },
    ]);
  });

  it("fails loudly on a row the database should never produce", async () => {
    const fake = createFakeSupabase([{ data: [{ challenge_id: "c1", correct_count: -1 }] }]);
    await expect(
      new SupabaseGamificationStore(fake.client).listUnpaidChallenges(USER, 50),
    ).rejects.toThrow();
  });
});

describe("SupabaseGamificationStore: achievements and ledger", () => {
  it("lists the student's own unlocked achievements", async () => {
    const fake = createFakeSupabase([
      { data: [{ code: "first_session", unlocked_at: "2026-10-09T10:00:00.000Z" }] },
    ]);
    const rows = await new SupabaseGamificationStore(fake.client).listAchievements(USER);
    expect(String(fake.callsOn("from:user_achievements", "select")[0].args[0])).toBe(
      "code, unlocked_at",
    );
    expect(chain(fake)).toEqual(expect.arrayContaining([["eq", "user_id", USER]]));
    expect(rows).toEqual([
      { code: "first_session", unlockedAt: new Date("2026-10-09T10:00:00.000Z") },
    ]);
  });

  it("unlocks achievements in the database's shape and returns the new codes", async () => {
    const fake = createFakeSupabase([{ data: ["first_session"] }]);
    const codes = await new SupabaseGamificationStore(fake.client).unlockAchievements(USER, [
      {
        code: "first_session",
        title: "First session",
        description: "d",
        xp: 25,
        unlockedAt: new Date("2026-10-09T10:00:00.000Z"),
      },
    ]);
    expect(codes).toEqual(["first_session"]);
    expect(rpcArgs(fake, "unlock_achievements")).toEqual({
      _user_id: USER,
      _unlocks: [{ code: "first_session", xp: 25, unlocked_at: "2026-10-09T10:00:00.000Z" }],
    });
  });

  it("pages the student's ledger, newest first, with explicit columns", async () => {
    const fake = createFakeSupabase([
      {
        data: [
          {
            source_type: "session",
            source_id: "e1",
            xp: 20,
            occurred_at: "2026-10-09T10:00:00.000Z",
          },
        ],
      },
    ]);
    const rows = await new SupabaseGamificationStore(fake.client).listXpEvents(USER, {
      limit: 11,
      offset: 20,
    });
    expect(String(fake.callsOn("from:xp_events", "select")[0].args[0])).toBe(
      "source_type, source_id, xp, occurred_at",
    );
    expect(chain(fake)).toEqual(
      expect.arrayContaining([
        ["eq", "user_id", USER],
        ["range", 20, 30],
      ]),
    );
    expect(rows).toEqual([
      {
        sourceType: "session",
        sourceId: "e1",
        xp: 20,
        occurredAt: new Date("2026-10-09T10:00:00.000Z"),
      },
    ]);
  });

  it("rethrows database errors", async () => {
    const error = { message: "boom" };
    const fake = createFakeSupabase([{ error }]);
    await expect(new SupabaseGamificationStore(fake.client).getTotalXp(USER)).rejects.toBe(error);
  });
});
