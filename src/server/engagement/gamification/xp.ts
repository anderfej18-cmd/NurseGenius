import { GAMIFICATION_CONFIG, type GamificationConfig } from "./gamification.config";

/** What the database knows about a finished session; the facts XP is worked out from. */
export interface SessionXpFacts {
  readonly examId: string;
  readonly completedAt: Date;
  readonly sessionType: string;
  readonly answered: number;
  readonly correct: number;
  /** Answers that were right and the first right answer ever given to that question. */
  readonly firstCorrect: number;
}

/** What the database knows about a finished daily challenge. */
export interface ChallengeXpFacts {
  readonly challengeId: string;
  readonly completedAt: Date;
  readonly correct: number;
  readonly total: number;
}

export type XpSourceType =
  | "session"
  | "daily_practice"
  | "perfect_session"
  | "achievement"
  | "daily_challenge"
  | "duel";

/** One payment to the ledger. Its source is unique, so recording it twice pays once. */
export interface XpEventDraft {
  readonly sourceType: XpSourceType;
  readonly sourceId: string;
  readonly xp: number;
  readonly occurredAt: Date;
}

/**
 * The XP a finished session earns. The `session` event is always produced, even at 0 XP, so the
 * session is recorded as processed. The two daily bonuses are keyed by UTC date: however many
 * sessions qualify in a day, only the first is paid. Pure; rules in docs/formulas.md (section 11).
 */
export function xpEventsForSession(
  facts: SessionXpFacts,
  config: GamificationConfig = GAMIFICATION_CONFIG,
): XpEventDraft[] {
  const { xp } = config;
  const day = facts.completedAt.toISOString().slice(0, 10);
  const event = (sourceType: XpSourceType, sourceId: string, amount: number): XpEventDraft => ({
    sourceType,
    sourceId,
    xp: amount,
    occurredAt: facts.completedAt,
  });

  const events = [event("session", facts.examId, facts.firstCorrect * xp.firstCorrect)];
  if (facts.answered >= xp.dailyPractice.minAnswered) {
    events.push(event("daily_practice", day, xp.dailyPractice.xp));
  }
  if (facts.answered >= xp.perfectSession.minAnswered && facts.correct === facts.answered) {
    events.push(event("perfect_session", day, xp.perfectSession.xp));
  }
  return events;
}

/**
 * The XP a finished daily challenge earns: per right answer, plus a bonus for all of them right.
 * A challenge with no right answers pays 0 but is still recorded, so it is not looked at again.
 */
export function xpEventForChallenge(
  facts: ChallengeXpFacts,
  config: GamificationConfig = GAMIFICATION_CONFIG,
): XpEventDraft {
  const { perCorrect, perfectBonus } = config.xp.dailyChallenge;
  const perfect = facts.total > 0 && facts.correct === facts.total;
  return {
    sourceType: "daily_challenge",
    sourceId: facts.challengeId,
    xp: facts.correct * perCorrect + (perfect ? perfectBonus : 0),
    occurredAt: facts.completedAt,
  };
}
