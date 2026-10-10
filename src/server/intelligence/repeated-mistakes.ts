import type { AttemptSignal } from "./attempt.types";
import { groupBy } from "./group-by";

/**
 * Questions missed at least `minMisses` times whose latest answer is still wrong, out of the
 * distinct questions attempted. `sorted` must be oldest first.
 */
export function countRepeatedMistakes(
  sorted: readonly AttemptSignal[],
  minMisses: number,
): { readonly repeated: number; readonly questions: number } {
  const byQuestion = groupBy(sorted, (attempt) => attempt.questionId);
  let repeated = 0;
  for (const history of byQuestion.values()) {
    const misses = history.filter((attempt) => !attempt.correct).length;
    const latest = history.at(-1);
    if (misses >= minMisses && latest !== undefined && !latest.correct) repeated += 1;
  }
  return { repeated, questions: byQuestion.size };
}
