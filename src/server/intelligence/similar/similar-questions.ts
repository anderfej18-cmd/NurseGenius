import type { Difficulty } from "../attempt.types";
import type { ExamType } from "../../types";
import { SIMILAR_CONFIG, type SimilarConfig } from "./similar.config";
import { wordingSimilarity } from "./wording";

export interface SimilarSource {
  readonly id: string;
  readonly examType: ExamType;
  readonly topic: string;
  readonly subtopicId: string | null;
  readonly difficulty: Difficulty | null;
  readonly tags: readonly string[];
  /** The question's wording, compared with each candidate's; never the answer key. */
  readonly questionText: string;
}

/** A question that might be similar; carries content for display but never the answer key. */
export interface SimilarCandidate extends Omit<SimilarSource, "questionText"> {
  readonly year: number | null;
  readonly question: {
    readonly question_text: string;
    readonly option_a: string;
    readonly option_b: string;
    readonly option_c: string;
    readonly option_d: string;
  };
}

export type SimilarityReason =
  | "same_topic"
  | "same_subtopic"
  | "same_difficulty"
  | "adjacent_difficulty"
  | "shared_tags"
  | "similar_wording";

export interface RankedSimilar {
  readonly candidate: SimilarCandidate;
  /** 0 to 1: the points earned over the most that could be earned. */
  readonly score: number;
  readonly reasons: readonly SimilarityReason[];
  /** Whether the student has already answered this question. */
  readonly attempted: boolean;
}

const DIFFICULTY_POSITION: Readonly<Record<Difficulty, number>> = { easy: 0, medium: 1, hard: 2 };

/**
 * The questions most like `source`, from `candidates`, by metadata alone: topic, subtopic,
 * difficulty and shared tags. Only questions of the same exam type that share the topic or the
 * subtopic are eligible. Pure; formula in docs/formulas.md (section 7).
 */
export function rankSimilar(
  source: SimilarSource,
  candidates: readonly SimilarCandidate[],
  attempted: ReadonlySet<string>,
  limit: number,
  config: SimilarConfig = SIMILAR_CONFIG,
): RankedSimilar[] {
  if (limit <= 0) return [];
  const { points, maxSharedTags } = config;
  const best =
    points.sameTopic +
    points.sameSubtopic +
    points.sameDifficulty +
    maxSharedTags * points.sharedTag +
    points.similarWording;

  const ranked = candidates.flatMap((candidate): RankedSimilar[] => {
    if (candidate.id === source.id || candidate.examType !== source.examType) return [];
    const sameTopic = candidate.topic === source.topic;
    const sameSubtopic = source.subtopicId !== null && candidate.subtopicId === source.subtopicId;
    if (!sameTopic && !sameSubtopic) return [];

    const reasons: SimilarityReason[] = [];
    let earned = 0;
    if (sameTopic) {
      reasons.push("same_topic");
      earned += points.sameTopic;
    }
    if (sameSubtopic) {
      reasons.push("same_subtopic");
      earned += points.sameSubtopic;
    }
    const distance = difficultyDistance(source.difficulty, candidate.difficulty);
    if (distance === 0) {
      reasons.push("same_difficulty");
      earned += points.sameDifficulty;
    } else if (distance === 1) {
      reasons.push("adjacent_difficulty");
      earned += points.adjacentDifficulty;
    }
    const sharedTags = candidate.tags.filter((tag) => source.tags.includes(tag)).length;
    if (sharedTags > 0) {
      reasons.push("shared_tags");
      earned += Math.min(sharedTags, maxSharedTags) * points.sharedTag;
    }
    const overlap = wordingSimilarity(
      source.questionText,
      candidate.question.question_text,
      config,
    );
    if (overlap > 0) {
      reasons.push("similar_wording");
      earned += overlap * points.similarWording;
    }
    return [{ candidate, score: earned / best, reasons, attempted: attempted.has(candidate.id) }];
  });

  return ranked
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(a.attempted) - Number(b.attempted) ||
        a.candidate.id.localeCompare(b.candidate.id),
    )
    .slice(0, limit);
}

/** Steps between two difficulties; null when either is unknown. */
function difficultyDistance(a: Difficulty | null, b: Difficulty | null): number | null {
  return a === null || b === null
    ? null
    : Math.abs(DIFFICULTY_POSITION[a] - DIFFICULTY_POSITION[b]);
}
