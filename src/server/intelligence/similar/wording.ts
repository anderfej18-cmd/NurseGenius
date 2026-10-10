import { SIMILAR_CONFIG, type SimilarConfig } from "./similar.config";

// Words every exam question uses; they say nothing about what a question is about.
const COMMON = new Set([
  "which",
  "following",
  "should",
  "would",
  "could",
  "most",
  "best",
  "first",
  "priority",
  "action",
  "appropriate",
  "correct",
  "statement",
  "patient",
  "patients",
  "client",
  "clients",
  "nurse",
  "nursing",
  "that",
  "this",
  "with",
  "from",
  "when",
  "what",
  "after",
  "before",
  "about",
  "their",
  "there",
  "these",
  "those",
  "than",
  "then",
  "have",
  "been",
  "being",
  "will",
  "your",
  "also",
  "include",
  "includes",
  "indicates",
  "indicate",
  "following",
  "response",
  "respond",
  "care",
]);

function meaningfulWords(text: string, minLength: number): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
      (word) => word.length >= minLength && !COMMON.has(word),
    ),
  );
}

/**
 * How much two questions' wording overlaps, 0 to 1: the Jaccard index of their meaningful words,
 * or 0 when they share too few or too small a share to mean anything. Pure and symmetric. This is a
 * plain-text fallback; no embeddings are used (docs/adr/0011, docs/formulas.md section 17).
 */
export function wordingSimilarity(
  a: string,
  b: string,
  config: SimilarConfig = SIMILAR_CONFIG,
): number {
  const { minWordLength, minSharedWords, minOverlap } = config.wording;
  const left = meaningfulWords(a, minWordLength);
  const right = meaningfulWords(b, minWordLength);
  if (left.size === 0 || right.size === 0) return 0;
  const shared = [...left].filter((word) => right.has(word)).length;
  if (shared < minSharedWords) return 0;
  const overlap = shared / (left.size + right.size - shared);
  return overlap >= minOverlap ? overlap : 0;
}
