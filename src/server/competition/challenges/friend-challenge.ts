import type { ExamType } from "../../types";

/** One challenge as the database reports it to one of its two students. */
export interface ChallengeView {
  readonly id: string;
  /** Whether the viewer set the challenge or was challenged. */
  readonly role: "challenger" | "opponent";
  readonly opponentUsername: string;
  readonly examType: ExamType;
  readonly totalQuestions: number;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly declinedAt: Date | null;
  readonly myExamId: string | null;
  /** `in_progress` or `completed`; null before the viewer starts. */
  readonly myExamStatus: string | null;
  readonly myCorrect: number | null;
  readonly myScorePct: number | null;
  readonly myCompletedAt: Date | null;
  /** Null until the opponent starts. */
  readonly theirExamStatus: string | null;
  /** The opponent's result: null until the viewer has finished (the database withholds it). */
  readonly theirCorrect: number | null;
  readonly theirScorePct: number | null;
  readonly theirCompletedAt: Date | null;
}

export interface SideResult {
  readonly correct: number;
  readonly scorePct: number;
}

export type ChallengeState =
  | { readonly status: "not_started" }
  | { readonly status: "in_progress" }
  | { readonly status: "waiting_for_opponent" }
  | { readonly status: "declined" }
  | { readonly status: "expired" }
  | {
      readonly status: "completed";
      readonly winner: "you" | "opponent" | "draw";
      readonly you: SideResult;
      readonly opponent: SideResult;
    };

/**
 * Where a challenge stands for the student looking at it, from the two exams alone; nothing is
 * stored. Both sides answer the same questions, so the winner is whoever has more right answers; equal
 * is a draw. Time is not compared (it is reported by the student's browser). Rules in
 * docs/formulas.md (section 14).
 */
export function challengeState(view: ChallengeView, now: Date): ChallengeState {
  if (
    view.myExamStatus === "completed" &&
    view.theirExamStatus === "completed" &&
    view.myCorrect !== null &&
    view.myScorePct !== null &&
    view.theirCorrect !== null &&
    view.theirScorePct !== null
  ) {
    return {
      status: "completed",
      winner: winnerOf(view.myCorrect, view.theirCorrect),
      you: { correct: view.myCorrect, scorePct: view.myScorePct },
      opponent: { correct: view.theirCorrect, scorePct: view.theirScorePct },
    };
  }
  if (view.declinedAt !== null) return { status: "declined" };

  const open = now.getTime() < view.expiresAt.getTime();
  if (view.myExamStatus === "completed") {
    // The opponent may finish a session they started even after the challenge closed.
    return view.theirExamStatus === null && !open
      ? { status: "expired" }
      : { status: "waiting_for_opponent" };
  }
  if (view.myExamStatus === "in_progress") return { status: "in_progress" };
  return open ? { status: "not_started" } : { status: "expired" };
}

function winnerOf(mine: number, theirs: number): "you" | "opponent" | "draw" {
  if (mine === theirs) return "draw";
  return mine > theirs ? "you" : "opponent";
}
