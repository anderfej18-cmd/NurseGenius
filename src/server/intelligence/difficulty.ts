import type { Difficulty } from "./attempt.types";
import { EMPIRICAL_DIFFICULTY, type EmpiricalDifficultyConfig } from "./intelligence.config";

export interface OutcomeCounts {
  readonly attempts: number;
  readonly correct: number;
}

type EmpiricalConfig =
  | typeof EMPIRICAL_DIFFICULTY
  | { [K in keyof typeof EMPIRICAL_DIFFICULTY]: number };

/** Difficulty implied by how all students fared; null until enough of them have answered. */
export function empiricalDifficulty(
  counts: OutcomeCounts | undefined,
  config: EmpiricalDifficultyConfig = EMPIRICAL_DIFFICULTY,
): Difficulty | null {
  if (counts === undefined || counts.attempts < config.minAttempts) return null;
  const rate = counts.correct / counts.attempts;
  if (rate >= config.easyAtOrAbove) return "easy";
  if (rate <= config.hardAtOrBelow) return "hard";
  return "medium";
}

/** An admin-set difficulty wins; otherwise the empirical one; otherwise unknown. */
export function resolveDifficulty(
  adminSet: Difficulty | null,
  counts: OutcomeCounts | undefined,
): Difficulty | null {
  return adminSet ?? empiricalDifficulty(counts);
}
