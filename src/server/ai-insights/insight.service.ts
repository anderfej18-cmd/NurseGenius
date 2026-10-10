import { LimitReachedError } from "../errors";
import type { ExamType } from "../types";
import { enforceLimits, type RateLimiter } from "../rate-limit/rate-limit";
import { factsHash } from "./facts-hash";
import { checkGrounding } from "./grounding";
import { AI_INSIGHT_CONFIG } from "./insight.config";
import {
  type InsightFacts,
  type InsightKind,
  type InsightResult,
  type InsightStatus,
  type Narrative,
  narrativeSchema,
} from "./insight.types";

/** What the model returns for one request. `narrative` is untrusted until it has been validated. */
export interface NarratorResult {
  readonly narrative: unknown;
  readonly model: string;
  readonly promptVersion: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
}

/** The AI seam (ADR-0011): turns measured statements into text. The Edge Function is one implementation; the computed summary is the other. */
export interface InsightNarrator {
  narrate(request: {
    readonly kind: InsightKind;
    readonly facts: readonly string[];
    readonly topics: readonly string[];
  }): Promise<NarratorResult>;
}

/** The provider cannot answer now: down, slow, refused or not deployed. Never shown to the student. */
export class NarratorUnavailableError extends Error {}

export interface StoredInsight {
  readonly factsHash: string;
  readonly narrative: Narrative;
  readonly generatedAt: string;
}

export interface NewInsight extends StoredInsight {
  readonly model: string;
  readonly promptVersion: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
}

/** Choices that change what is measured, not who is asking. */
export interface InsightOptions {
  /** Today's study time, for the recommendation. */
  readonly availableMinutes?: number;
  /** The exam the readiness is for. */
  readonly examType?: ExamType;
}

interface Dependencies {
  /** Measures the student for one kind of explanation; each is built by deterministic code. */
  readonly facts: Readonly<
    Record<InsightKind, (userId: string, options: InsightOptions) => Promise<InsightFacts>>
  >;
  readonly store: {
    find(userId: string, kind: InsightKind): Promise<StoredInsight | null>;
    save(userId: string, kind: InsightKind, insight: NewInsight): Promise<void>;
  };
  readonly narrator: InsightNarrator;
  readonly limiter: RateLimiter;
  readonly clock: () => Date;
  readonly log: (message: string, detail: Record<string, unknown>) => void;
}

/**
 * Explains a student's measured facts in plain words. The numbers always come from deterministic code;
 * the model only phrases them, and its answer is used only if it fits the schema and rests on those
 * facts. In every other case the student sees the computed summary built from the same facts, never an error.
 */
export class AiInsightService {
  private readonly inFlight = new Map<string, Promise<InsightResult>>();

  constructor(private readonly deps: Dependencies) {}

  async get(
    userId: string,
    kind: InsightKind,
    options: InsightOptions = {},
  ): Promise<InsightResult> {
    const facts = await this.deps.facts[kind](userId, options);
    if (!facts.sufficientEvidence) return this.computed(facts, "insufficient_data");

    const hash = await factsHash(facts, AI_INSIGHT_CONFIG.promptVersion);
    const stored = await this.deps.store.find(userId, kind);
    if (stored !== null && stored.factsHash === hash) {
      return this.fromModel(facts, stored.narrative, stored.generatedAt);
    }

    // Two requests for the same facts at once share one model call.
    const key = `${userId}:${kind}:${hash}`;
    const pending = this.inFlight.get(key) ?? this.write(userId, facts, hash);
    this.inFlight.set(key, pending);
    try {
      return await pending;
    } finally {
      this.inFlight.delete(key);
    }
  }

  private async write(userId: string, facts: InsightFacts, hash: string): Promise<InsightResult> {
    const { limiter, narrator, store, clock } = this.deps;
    const { burst, daily } = AI_INSIGHT_CONFIG.limits;
    try {
      await enforceLimits(limiter, [
        { bucket: `ai-insight:burst:${userId}`, ...burst },
        { bucket: `ai-insight:daily:${userId}`, ...daily },
      ]);
    } catch (error) {
      if (error instanceof LimitReachedError) return this.computed(facts, "rate_limited");
      throw error;
    }

    let result: NarratorResult;
    try {
      result = await narrator.narrate({
        kind: facts.kind,
        facts: facts.facts,
        topics: facts.topics,
      });
    } catch (error) {
      return this.unavailable(facts, "provider_error", error);
    }

    const parsed = narrativeSchema.safeParse(result.narrative);
    if (!parsed.success) return this.unavailable(facts, "malformed_output");
    const grounding = checkGrounding(parsed.data, facts);
    if (!grounding.ok) return this.unavailable(facts, grounding.reason);

    const generatedAt = clock().toISOString();
    try {
      await store.save(userId, facts.kind, {
        factsHash: hash,
        narrative: parsed.data,
        generatedAt,
        model: result.model,
        promptVersion: result.promptVersion,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
      });
    } catch (error) {
      // The student already has their explanation; only the saving failed, so the next view asks again.
      this.deps.log("ai-insight save failed", { kind: facts.kind, error: errorName(error) });
    }
    return this.fromModel(facts, parsed.data, generatedAt);
  }

  private fromModel(facts: InsightFacts, narrative: Narrative, generatedAt: string): InsightResult {
    return {
      kind: facts.kind,
      source: "ai",
      status: "ok",
      narrative,
      facts: facts.facts,
      generatedAt,
    };
  }

  private computed(facts: InsightFacts, status: InsightStatus): InsightResult {
    return {
      kind: facts.kind,
      source: "computed",
      status,
      narrative: facts.fallback,
      facts: facts.facts,
      generatedAt: null,
    };
  }

  private unavailable(facts: InsightFacts, reason: string, error?: unknown): InsightResult {
    this.deps.log("ai-insight discarded", { kind: facts.kind, reason, error: errorName(error) });
    return this.computed(facts, "ai_unavailable");
  }
}

// Only the error's class, never its message: a provider's message can echo a request or a credential.
const errorName = (error: unknown): string | null => (error instanceof Error ? error.name : null);
