import { NotFoundError } from "@/lib/app-errors";
import type { Difficulty } from "../attempt.types";
import { SIMILAR_CONFIG, type SimilarConfig } from "./similar.config";
import {
  rankSimilar,
  type SimilarCandidate,
  type SimilarSource,
  type SimilarityReason,
} from "./similar-questions";

/** What this service needs from storage; declared here, next to its only consumer. */
interface Dependencies {
  readonly store: {
    getSource(questionId: string): Promise<SimilarSource | null>;
    listCandidates(source: SimilarSource, limit: number): Promise<SimilarCandidate[]>;
  };
  readonly progress: {
    listProgress(userId: string): Promise<ReadonlyMap<string, { readonly attempts: number }>>;
  };
  readonly config?: SimilarConfig;
}

export interface SimilarQuestion {
  readonly id: string;
  readonly topic: string;
  readonly subtopicId: string | null;
  readonly difficulty: Difficulty | null;
  readonly tags: readonly string[];
  readonly year: number | null;
  /** 0 to 1, two decimals. */
  readonly score: number;
  readonly reasons: readonly SimilarityReason[];
  readonly attempted: boolean;
  readonly question: SimilarCandidate["question"];
}

export interface SimilarQuestionsResult {
  readonly source: {
    readonly id: string;
    readonly topic: string;
    readonly subtopicId: string | null;
    readonly difficulty: Difficulty | null;
  };
  readonly items: readonly SimilarQuestion[];
}

/** Finds questions related to one the student has attempted, from existing metadata only. */
export class SimilarQuestionService {
  private readonly config: SimilarConfig;

  constructor(private readonly deps: Dependencies) {
    this.config = deps.config ?? SIMILAR_CONFIG;
  }

  async find(
    userId: string,
    questionId: string,
    requestedLimit?: number,
  ): Promise<SimilarQuestionsResult> {
    const progress = await this.deps.progress.listProgress(userId);
    // A question the student never answered looks the same as one that does not exist.
    if ((progress.get(questionId)?.attempts ?? 0) === 0)
      throw new NotFoundError("Question not found.");

    const source = await this.deps.store.getSource(questionId);
    if (source === null) throw new NotFoundError("Question not found.");

    const candidates = await this.deps.store.listCandidates(source, this.config.maxCandidates);
    const attempted = new Set(
      [...progress].filter(([, entry]) => entry.attempts > 0).map(([id]) => id),
    );
    const limit = Math.min(
      Math.max(requestedLimit ?? this.config.defaultLimit, 1),
      this.config.maxLimit,
    );

    return {
      source: {
        id: source.id,
        topic: source.topic,
        subtopicId: source.subtopicId,
        difficulty: source.difficulty,
      },
      items: rankSimilar(source, candidates, attempted, limit, this.config).map(
        ({ candidate, score, reasons, attempted: seen }) => ({
          id: candidate.id,
          topic: candidate.topic,
          subtopicId: candidate.subtopicId,
          difficulty: candidate.difficulty,
          tags: candidate.tags,
          year: candidate.year,
          score: Math.round(score * 100) / 100,
          reasons,
          attempted: seen,
          question: candidate.question,
        }),
      ),
    };
  }
}
