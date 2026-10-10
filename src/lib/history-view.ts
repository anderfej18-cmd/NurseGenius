// Wording for the test-history screen. Pure functions so the words are tested. The numbers come
// from the server (averages are computed there); nothing here scores anything.
import { SESSION_MODES, type SessionType } from "./session-modes";

export const sessionTypeLabel = (sessionType: string): string =>
  sessionType in SESSION_MODES ? SESSION_MODES[sessionType as SessionType].label : sessionType;

export function historyScoreText(exam: {
  scoreVerified: boolean;
  scorePct: number | null;
}): string {
  if (!exam.scoreVerified) return "Not verified";
  return exam.scorePct === null ? "—" : `${exam.scorePct.toFixed(1)}%`;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function historySummaryText(summary: {
  verifiedCount: number;
  unverifiedCount: number;
  averageScorePct: number | null;
}): string {
  const { verifiedCount, unverifiedCount, averageScorePct } = summary;
  if (verifiedCount === 0 && unverifiedCount === 0) return "You have not finished a test yet.";
  const left =
    unverifiedCount === 0
      ? ""
      : `${plural(unverifiedCount, "older test is", "older tests are")} left out because ${
          unverifiedCount === 1 ? "its score was" : "their scores were"
        } never checked against the answer key.`;
  if (averageScorePct === null) return `No average yet: ${left}`;
  const main = `Average ${averageScorePct.toFixed(1)}% over ${plural(verifiedCount, "verified test", "verified tests")}.`;
  return left === "" ? main : `${main} ${left}`;
}
