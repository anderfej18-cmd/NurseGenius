/** Weights of the metadata similarity between questions (docs/formulas.md, section 7). */
export interface SimilarConfig {
  readonly points: {
    readonly sameTopic: number;
    readonly sameSubtopic: number;
    readonly sameDifficulty: number;
    readonly adjacentDifficulty: number;
    /** Awarded per shared tag, up to `maxSharedTags`. */
    readonly sharedTag: number;
    /** Awarded in proportion to how much the questions' wording overlaps (0 to this). */
    readonly similarWording: number;
  };
  readonly wording: {
    readonly minWordLength: number;
    readonly minSharedWords: number;
    /** Overlap below this counts as none. */
    readonly minOverlap: number;
  };
  readonly maxSharedTags: number;
  /** Candidates fetched per query before ranking. */
  readonly maxCandidates: number;
  readonly defaultLimit: number;
  readonly maxLimit: number;
}

export const SIMILAR_CONFIG = {
  points: {
    sameTopic: 3,
    sameSubtopic: 2,
    sameDifficulty: 1,
    adjacentDifficulty: 0.5,
    sharedTag: 0.5,
    similarWording: 1.5,
  },
  wording: { minWordLength: 4, minSharedWords: 3, minOverlap: 0.2 },
  maxSharedTags: 2,
  maxCandidates: 300,
  defaultLimit: 5,
  maxLimit: 20,
} as const satisfies SimilarConfig;
