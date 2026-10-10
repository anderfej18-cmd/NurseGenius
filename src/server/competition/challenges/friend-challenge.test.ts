import { describe, expect, it } from "vitest";
import { type ChallengeView, challengeState } from "./friend-challenge";

const NOW = new Date("2026-10-10T12:00:00.000Z");
const FUTURE = new Date("2026-10-15T12:00:00.000Z");
const PAST = new Date("2026-10-09T12:00:00.000Z");

const view = (overrides: Partial<ChallengeView> = {}): ChallengeView => ({
  id: "c1",
  role: "challenger",
  opponentUsername: "bob",
  examType: "RN",
  totalQuestions: 10,
  createdAt: new Date("2026-10-08T12:00:00.000Z"),
  expiresAt: FUTURE,
  declinedAt: null,
  myExamId: null,
  myExamStatus: null,
  myCorrect: null,
  myScorePct: null,
  myCompletedAt: null,
  theirExamStatus: null,
  theirCorrect: null,
  theirScorePct: null,
  theirCompletedAt: null,
  ...overrides,
});
const mineDone = { myExamId: "e1", myExamStatus: "completed", myCorrect: 7, myScorePct: 70 };

describe("challengeState", () => {
  it("is not started while the student has not begun and the challenge is open", () => {
    expect(challengeState(view(), NOW)).toEqual({ status: "not_started" });
  });

  it("is in progress while the student's own session runs", () => {
    expect(challengeState(view({ myExamId: "e1", myExamStatus: "in_progress" }), NOW)).toEqual({
      status: "in_progress",
    });
  });

  it("waits for the opponent once the student has finished and the opponent has not", () => {
    expect(challengeState(view(mineDone), NOW)).toEqual({ status: "waiting_for_opponent" });
    expect(challengeState(view({ ...mineDone, theirExamStatus: "in_progress" }), NOW)).toEqual({
      status: "waiting_for_opponent",
    });
  });

  it("keeps waiting for an opponent who started before the deadline, even after it", () => {
    expect(
      challengeState(view({ ...mineDone, theirExamStatus: "in_progress", expiresAt: PAST }), NOW),
    ).toEqual({ status: "waiting_for_opponent" });
  });

  it("is expired when the time ran out before the student started", () => {
    expect(challengeState(view({ expiresAt: PAST }), NOW)).toEqual({ status: "expired" });
  });

  it("is expired when the student finished and the opponent never started", () => {
    expect(challengeState(view({ ...mineDone, expiresAt: PAST }), NOW)).toEqual({
      status: "expired",
    });
  });

  it("is declined once the opponent declined, whoever is asking", () => {
    expect(challengeState(view({ declinedAt: PAST }), NOW)).toEqual({ status: "declined" });
    expect(challengeState(view({ ...mineDone, declinedAt: PAST }), NOW)).toEqual({
      status: "declined",
    });
  });

  describe("when both have finished", () => {
    const both = (theirCorrect: number) =>
      view({
        ...mineDone,
        theirExamStatus: "completed",
        theirCorrect,
        theirScorePct: theirCorrect * 10,
      });

    it("is won by the higher number of right answers", () => {
      expect(challengeState(both(4), NOW)).toEqual({
        status: "completed",
        winner: "you",
        you: { correct: 7, scorePct: 70 },
        opponent: { correct: 4, scorePct: 40 },
      });
      expect(challengeState(both(9), NOW)).toMatchObject({
        status: "completed",
        winner: "opponent",
      });
    });

    it("is a draw on equal right answers", () => {
      expect(challengeState(both(7), NOW)).toMatchObject({ status: "completed", winner: "draw" });
    });

    it("stays completed after the challenge has expired", () => {
      expect(challengeState({ ...both(4), expiresAt: PAST }, NOW)).toMatchObject({
        status: "completed",
      });
    });
  });

  it("does not announce a result whose scores are missing", () => {
    expect(challengeState(view({ ...mineDone, theirExamStatus: "completed" }), NOW)).toEqual({
      status: "waiting_for_opponent",
    });
  });
});
