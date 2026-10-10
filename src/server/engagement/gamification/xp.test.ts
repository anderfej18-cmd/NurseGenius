import { describe, expect, it } from "vitest";
import { GAMIFICATION_CONFIG } from "./gamification.config";
import {
  type ChallengeXpFacts,
  type SessionXpFacts,
  xpEventForChallenge,
  xpEventsForSession,
} from "./xp";

const DONE = new Date("2026-10-05T14:30:00.000Z");
const facts = (overrides: Partial<SessionXpFacts> = {}): SessionXpFacts => ({
  examId: "exam-1",
  completedAt: DONE,
  sessionType: "mixed",
  answered: 8,
  correct: 6,
  firstCorrect: 4,
  ...overrides,
});
const kinds = (events: ReturnType<typeof xpEventsForSession>) =>
  events.map((event) => [event.sourceType, event.sourceId, event.xp]);

describe("xpEventsForSession", () => {
  it("pays 10 XP per first-time correct answer and the daily practice bonus", () => {
    expect(kinds(xpEventsForSession(facts()))).toEqual([
      ["session", "exam-1", 40],
      ["daily_practice", "2026-10-05", 20],
    ]);
  });

  it("pays no daily bonus for fewer than 5 answers", () => {
    expect(kinds(xpEventsForSession(facts({ answered: 4, correct: 4, firstCorrect: 4 })))).toEqual([
      ["session", "exam-1", 40],
    ]);
  });

  it("adds the perfect-session bonus for 10 or more answers, all right", () => {
    const events = xpEventsForSession(facts({ answered: 10, correct: 10, firstCorrect: 10 }));
    expect(kinds(events)).toEqual([
      ["session", "exam-1", 100],
      ["daily_practice", "2026-10-05", 20],
      ["perfect_session", "2026-10-05", 20],
    ]);
  });

  it("gives no perfect bonus with one wrong answer, or with fewer than 10 answers", () => {
    expect(
      kinds(xpEventsForSession(facts({ answered: 10, correct: 9, firstCorrect: 9 }))).map(
        ([t]) => t,
      ),
    ).not.toContain("perfect_session");
    expect(
      kinds(xpEventsForSession(facts({ answered: 9, correct: 9, firstCorrect: 9 }))).map(
        ([t]) => t,
      ),
    ).not.toContain("perfect_session");
  });

  it("pays nothing per question for repeated questions, but still marks the session as processed", () => {
    const events = xpEventsForSession(facts({ answered: 6, correct: 6, firstCorrect: 0 }));
    expect(kinds(events)).toEqual([
      ["session", "exam-1", 0],
      ["daily_practice", "2026-10-05", 20],
    ]);
  });

  it("marks an empty session as processed with no XP", () => {
    expect(kinds(xpEventsForSession(facts({ answered: 0, correct: 0, firstCorrect: 0 })))).toEqual([
      ["session", "exam-1", 0],
    ]);
  });

  it("keys the daily bonuses by UTC date", () => {
    const late = xpEventsForSession(facts({ completedAt: new Date("2026-10-01T23:59:59.000Z") }));
    const early = xpEventsForSession(facts({ completedAt: new Date("2026-10-02T00:00:00.000Z") }));
    expect(late[1].sourceId).toBe("2026-10-01");
    expect(early[1].sourceId).toBe("2026-10-02");
  });

  it("dates every event at the completion time", () => {
    for (const event of xpEventsForSession(
      facts({ answered: 10, correct: 10, firstCorrect: 10 }),
    )) {
      expect(event.occurredAt).toEqual(DONE);
    }
  });

  it("follows the configured amounts", () => {
    const config = {
      ...GAMIFICATION_CONFIG,
      xp: { ...GAMIFICATION_CONFIG.xp, firstCorrect: 1, dailyPractice: { minAnswered: 1, xp: 3 } },
    };
    expect(
      kinds(xpEventsForSession(facts({ answered: 1, correct: 1, firstCorrect: 1 }), config)),
    ).toEqual([
      ["session", "exam-1", 1],
      ["daily_practice", "2026-10-05", 3],
    ]);
  });
});

describe("xpEventForChallenge", () => {
  const challenge = (overrides: Partial<ChallengeXpFacts> = {}): ChallengeXpFacts => ({
    challengeId: "c-1",
    completedAt: DONE,
    correct: 3,
    total: 5,
    ...overrides,
  });

  it("pays 8 XP per correct answer", () => {
    expect(xpEventForChallenge(challenge())).toEqual({
      sourceType: "daily_challenge",
      sourceId: "c-1",
      xp: 24,
      occurredAt: DONE,
    });
  });

  it("adds 10 XP for answering every question right", () => {
    expect(xpEventForChallenge(challenge({ correct: 5, total: 5 })).xp).toBe(50);
  });

  it("pays nothing for a challenge with no right answers, but still marks it processed", () => {
    expect(xpEventForChallenge(challenge({ correct: 0 }))).toMatchObject({
      sourceId: "c-1",
      xp: 0,
    });
  });

  it("gives no perfect bonus for an empty challenge", () => {
    expect(xpEventForChallenge(challenge({ correct: 0, total: 0 })).xp).toBe(0);
  });
});
