import type { SelectionReason } from "@/lib/session-modes";
import type { Difficulty } from "../attempt.types";
import type { TopicMastery } from "../mastery/mastery.service";
import { overdueDays } from "../review/due";
import { clamp01 } from "../statistics";
import {
  ADAPTIVE_SELECTION_CONFIG,
  type AdaptiveSelectionConfig,
} from "./adaptive-selection.config";

export interface CandidateQuestion {
  readonly id: string;
  readonly topic: string;
  /** Admin-set difficulty; null when unknown. */
  readonly difficulty: Difficulty | null;
}

/** What the student's history says about one question. */
export interface QuestionProgress {
  readonly attempts: number;
  readonly misses: number;
  /** Missed and not answered correctly since. */
  readonly unresolved: boolean;
  readonly nextReviewAt: Date | null;
}

export interface SelectionContext {
  readonly now: Date;
  readonly topics: ReadonlyMap<string, TopicMastery>;
  /** By question id; a question the student never answered has no entry. */
  readonly progress: ReadonlyMap<string, QuestionProgress>;
  /** Varies the order among equal scores from one session to the next, deterministically. */
  readonly seed: string;
}

export interface SelectionSignals {
  readonly weakTopic: number;
  readonly dueReview: number;
  readonly previousMistake: number;
  readonly lowExposure: number;
  readonly recentWeakness: number;
  readonly difficultyFit: number;
}

export interface ScoredCandidate<C extends CandidateQuestion> {
  readonly question: C;
  /** 0 to 1: the weighted sum of the signals. */
  readonly score: number;
  readonly signals: SelectionSignals;
  /** The signal that contributed most; stored with the session so the student can see why. */
  readonly reason: SelectionReason;
}

/** Mastery assumed for a topic the student has no history in: the neutral prior. */
const UNSEEN_TOPIC_SCORE = 50;

/**
 * Deterministic adaptive selection: scores every candidate question on six signals and takes the
 * best, with a cap per topic for variety. Pure; formula in docs/formulas.md (section 6).
 */
export class AdaptiveSelector {
  constructor(private readonly config: AdaptiveSelectionConfig = ADAPTIVE_SELECTION_CONFIG) {}

  /** The `count` best candidates, best first. Fewer if fewer exist. */
  select<C extends CandidateQuestion>(
    candidates: readonly C[],
    count: number,
    context: SelectionContext,
  ): ScoredCandidate<C>[] {
    if (count <= 0 || candidates.length === 0) return [];

    const ranked = candidates
      .map((question) => this.score(question, context))
      .sort(
        (a, b) =>
          b.score - a.score ||
          tieBreak(a.question.id, context.seed) - tieBreak(b.question.id, context.seed) ||
          a.question.id.localeCompare(b.question.id),
      );

    const topicCap = Math.max(1, Math.ceil(count * this.config.maxTopicShare));
    const perTopic = new Map<string, number>();
    const picked: ScoredCandidate<C>[] = [];
    const overflow: ScoredCandidate<C>[] = [];

    for (const entry of ranked) {
      if (picked.length >= count) break;
      const used = perTopic.get(entry.question.topic) ?? 0;
      if (used >= topicCap) {
        overflow.push(entry);
        continue;
      }
      perTopic.set(entry.question.topic, used + 1);
      picked.push(entry);
    }
    // A topic that hit its cap still fills places no other topic can.
    return [...picked, ...overflow].slice(0, count);
  }

  private score<C extends CandidateQuestion>(
    question: C,
    context: SelectionContext,
  ): ScoredCandidate<C> {
    const topic = context.topics.get(question.topic);
    const progress = context.progress.get(question.id);
    const topicScore = topic?.score ?? UNSEEN_TOPIC_SCORE;
    const recency = topic?.components.recency ?? null;

    const recentAccuracy = topic?.components.recency ?? null;
    const signals: SelectionSignals = {
      weakTopic: 1 - clamp01(topicScore / 100),
      dueReview: this.dueReview(progress, context.now),
      previousMistake: progress?.unresolved
        ? clamp01(progress.misses / this.config.mistakeSaturation)
        : 0,
      lowExposure: 1 / (1 + (progress?.attempts ?? 0)),
      recentWeakness:
        recentAccuracy === null ? this.config.unknownRecentWeakness : 1 - recentAccuracy,
      difficultyFit: this.difficultyFit(question.difficulty, topicScore),
    };
    const { weights } = this.config;
    const score =
      weights.weakTopic * signals.weakTopic +
      weights.dueReview * signals.dueReview +
      weights.previousMistake * signals.previousMistake +
      weights.lowExposure * signals.lowExposure +
      weights.recentWeakness * signals.recentWeakness +
      weights.difficultyFit * signals.difficultyFit;
    return {
      question,
      score,
      signals,
      reason: this.reason(signals, topic !== undefined, recency !== null),
    };
  }

  /**
   * The signal with the largest weighted share of the score. A topic the student has no results in
   * is never "weak", and recent weakness needs recent results; ties go to the earlier in this order.
   */
  private reason(
    signals: SelectionSignals,
    topicKnown: boolean,
    recentKnown: boolean,
  ): SelectionReason {
    const { weights } = this.config;
    const shares: ReadonlyArray<readonly [SelectionReason, number]> = [
      ["previous_mistake", weights.previousMistake * signals.previousMistake],
      ["due_review", weights.dueReview * signals.dueReview],
      ["weak_topic", topicKnown ? weights.weakTopic * signals.weakTopic : 0],
      ["recent_weakness", recentKnown ? weights.recentWeakness * signals.recentWeakness : 0],
      ["new_question", weights.lowExposure * signals.lowExposure],
    ];
    return shares.reduce((best, share) => (share[1] > best[1] ? share : best))[0];
  }

  /** Urgency from the moment a review is due, rising to 1 as it becomes overdue. */
  private dueReview(progress: QuestionProgress | undefined, now: Date): number {
    if (
      progress === undefined ||
      progress.nextReviewAt === null ||
      progress.nextReviewAt.getTime() > now.getTime()
    )
      return 0;
    const { baseUrgency, saturationDays } = this.config.dueReview;
    const overdue = Math.min(
      overdueDays({ nextReviewAt: progress.nextReviewAt }, now),
      saturationDays,
    );
    return baseUrgency + (1 - baseUrgency) * (overdue / saturationDays);
  }

  /** How close the question's difficulty is to what the student's mastery of the topic calls for. */
  private difficultyFit(difficulty: Difficulty | null, topicScore: number): number {
    if (difficulty === null) return this.config.unknownDifficultyFit;
    const target = clamp01(topicScore / 100);
    return 1 - Math.abs(this.config.difficultyLevel[difficulty] - target);
  }
}

/** FNV-1a hash of seed and id: a stable pseudo-random order among equal scores. */
function tieBreak(id: string, seed: string): number {
  let hash = 0x811c9dc5;
  for (const char of `${seed}|${id}`) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
