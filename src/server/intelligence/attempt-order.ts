import type { AttemptSignal } from "./attempt.types";

/**
 * Oldest first, with a total order: attempts answered at the same instant fall back to their
 * identifiers, so a result never depends on the order the database returned them in.
 */
export function byAnsweredAt(a: AttemptSignal, b: AttemptSignal): number {
  return (
    a.answeredAt.getTime() - b.answeredAt.getTime() ||
    a.questionId.localeCompare(b.questionId) ||
    a.sessionId.localeCompare(b.sessionId) ||
    Number(a.correct) - Number(b.correct)
  );
}
