import { describe, expect, it } from "vitest";
import type { Difficulty } from "../attempt.types";
import type { TopicMastery } from "../mastery/mastery.service";
import { SELECTION_REASONS } from "@/lib/session-modes";
import { ADAPTIVE_SELECTION_CONFIG } from "./adaptive-selection.config";
import {
  AdaptiveSelector,
  type CandidateQuestion,
  type QuestionProgress,
  type SelectionContext,
} from "./adaptive-selector";

const NOW = new Date("2026-10-10T09:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const daysFromNow = (days: number) => new Date(NOW.getTime() + days * DAY_MS);

const ORGANIC = "Organic Chemistry";
const STOICH = "Stoichiometry";
const ATOMIC = "Atomic Structure";

function mastery(topic: string, score: number, recency: number | null = 0.5): TopicMastery {
  return {
    topic,
    attempts: 30,
    score,
    rawScore: score / 100,
    evidence: 0.75,
    level: "developing",
    trend: "stable",
    components: { accuracy: 0.5, recency, consistency: null, difficulty: null, calibration: null },
    componentsUsed: ["accuracy"],
    penalties: { repeatedMistakes: 0 },
  };
}

let counter = 0;
const question = (topic: string, overrides: Partial<CandidateQuestion> = {}): CandidateQuestion => {
  counter += 1;
  return { id: `q${String(counter).padStart(4, "0")}`, topic, difficulty: null, ...overrides };
};
const many = (topic: string, count: number, overrides: Partial<CandidateQuestion> = {}) =>
  Array.from({ length: count }, () => question(topic, overrides));

const progress = (overrides: Partial<QuestionProgress> = {}): QuestionProgress => ({
  attempts: 1,
  misses: 0,
  unresolved: false,
  nextReviewAt: null,
  ...overrides,
});

function context(
  overrides: Partial<SelectionContext> = {},
  masteries: TopicMastery[] = [],
): SelectionContext {
  return {
    now: NOW,
    topics: new Map(masteries.map((m) => [m.topic, m])),
    progress: new Map(),
    seed: "seed-1",
    ...overrides,
  };
}

const selector = new AdaptiveSelector();
const ids = (selected: ReadonlyArray<{ question: CandidateQuestion }>) =>
  selected.map((s) => s.question.id);

describe("AdaptiveSelector: sizes and edge cases", () => {
  it("returns nothing when there are no candidates or none are wanted", () => {
    expect(selector.select([], 10, context())).toEqual([]);
    expect(selector.select(many(ORGANIC, 5), 0, context())).toEqual([]);
    expect(selector.select(many(ORGANIC, 5), -3, context())).toEqual([]);
  });

  it("returns every candidate, best first, when fewer exist than were asked for", () => {
    const candidates = many(ORGANIC, 3);
    expect(selector.select(candidates, 10, context())).toHaveLength(3);
  });

  it("returns exactly the number asked for from a larger pool, with no repeats", () => {
    const picked = ids(selector.select(many(ORGANIC, 40), 12, context()));
    expect(picked).toHaveLength(12);
    expect(new Set(picked).size).toBe(12);
  });

  it("is deterministic, independent of input order, and leaves its input untouched", () => {
    const candidates = Object.freeze([...many(ORGANIC, 10), ...many(STOICH, 10)]);
    const ctx = context({}, [mastery(ORGANIC, 42), mastery(STOICH, 55)]);
    const first = selector.select(candidates, 8, ctx);
    expect(ids(selector.select([...candidates].reverse(), 8, ctx))).toEqual(ids(first));
    expect(candidates).toHaveLength(20);
  });
});

describe("AdaptiveSelector: weak topics", () => {
  it("prioritises the topics the student is weakest in, rather than ones already dominated", () => {
    const candidates = [...many(ATOMIC, 10), ...many(STOICH, 10), ...many(ORGANIC, 10)];
    const ctx = context({}, [mastery(ORGANIC, 42), mastery(STOICH, 55), mastery(ATOMIC, 87)]);
    const picked = selector.select(candidates, 10, ctx).map((s) => s.question.topic);
    const countOf = (topic: string) => picked.filter((t) => t === topic).length;

    expect(countOf(ORGANIC)).toBeGreaterThan(countOf(STOICH));
    expect(countOf(STOICH)).toBeGreaterThan(countOf(ATOMIC));
    expect(countOf(ATOMIC)).toBeLessThanOrEqual(1);
  });

  it("treats a topic with no history as neither strong nor weak", () => {
    const [unseen] = selector.select([question("Never Practised")], 1, context());
    const [weak] = selector.select([question(ORGANIC)], 1, context({}, [mastery(ORGANIC, 20)]));
    const [strong] = selector.select([question(ATOMIC)], 1, context({}, [mastery(ATOMIC, 90)]));
    expect(unseen.signals.weakTopic).toBeCloseTo(0.5, 5);
    expect(weak.signals.weakTopic).toBeGreaterThan(unseen.signals.weakTopic);
    expect(strong.signals.weakTopic).toBeLessThan(unseen.signals.weakTopic);
  });

  it("favours a topic whose recent answers are poor over one of equal mastery whose recent answers are good", () => {
    const sliding = question("Sliding");
    const steady = question("Steady");
    const ctx = context({}, [mastery("Sliding", 60, 0.2), mastery("Steady", 60, 0.9)]);
    expect(ids(selector.select([steady, sliding], 1, ctx))).toEqual([sliding.id]);
  });
});

describe("AdaptiveSelector: reviews, mistakes and exposure", () => {
  it("puts a due review ahead of an equal question that is not due", () => {
    const due = question(ORGANIC);
    const notDue = question(ORGANIC);
    const ctx = context({
      progress: new Map([
        [due.id, progress({ nextReviewAt: daysFromNow(-3) })],
        [notDue.id, progress({ nextReviewAt: daysFromNow(5) })],
      ]),
    });
    expect(ids(selector.select([notDue, due], 1, ctx))).toEqual([due.id]);
  });

  it("rates a review more urgent the longer it is overdue, up to a limit", () => {
    const urgency = (overdue: number) => {
      const q = question(ORGANIC);
      const ctx = context({
        progress: new Map([[q.id, progress({ nextReviewAt: daysFromNow(-overdue) })]]),
      });
      return selector.select([q], 1, ctx)[0].signals.dueReview;
    };
    expect(urgency(0)).toBeCloseTo(0.5, 5); // just became due
    expect(urgency(7)).toBeCloseTo(0.75, 5);
    expect(urgency(14)).toBeCloseTo(1, 5);
    expect(urgency(60)).toBeCloseTo(1, 5); // capped
  });

  it("gives no credit for a review that is not due yet or has never been scheduled", () => {
    const future = question(ORGANIC);
    const never = question(ORGANIC);
    const ctx = context({
      progress: new Map([[future.id, progress({ nextReviewAt: daysFromNow(2) })]]),
    });
    const signals = selector.select([future, never], 2, ctx).map((s) => s.signals.dueReview);
    expect(signals).toEqual([0, 0]);
  });

  it("prefers a question the student keeps missing to one never missed", () => {
    const missed = question(ORGANIC);
    const clean = question(ORGANIC);
    const ctx = context({
      progress: new Map([
        [missed.id, progress({ attempts: 4, misses: 3, unresolved: true })],
        [clean.id, progress({ attempts: 4 })],
      ]),
    });
    const result = selector.select([clean, missed], 2, ctx);
    expect(ids(result)[0]).toBe(missed.id);
    expect(result[0].signals.previousMistake).toBe(1);
  });

  it("does not push a mistake that has since been answered correctly", () => {
    const fixed = question(ORGANIC);
    const ctx = context({
      progress: new Map([[fixed.id, progress({ attempts: 3, misses: 2, unresolved: false })]]),
    });
    expect(selector.select([fixed], 1, ctx)[0].signals.previousMistake).toBe(0);
  });

  it("scales the mistake signal with how often the question was missed", () => {
    const signalFor = (misses: number) => {
      const q = question(ORGANIC);
      const ctx = context({
        progress: new Map([[q.id, progress({ attempts: misses, misses, unresolved: true })]]),
      });
      return selector.select([q], 1, ctx)[0].signals.previousMistake;
    };
    expect(signalFor(1)).toBeCloseTo(1 / 3, 5);
    expect(signalFor(2)).toBeCloseTo(2 / 3, 5);
    expect(signalFor(9)).toBe(1);
  });

  it("prefers a question the student has not seen over one seen many times", () => {
    const fresh = question(ORGANIC);
    const worn = question(ORGANIC);
    const ctx = context({ progress: new Map([[worn.id, progress({ attempts: 10 })]]) });
    const result = selector.select([worn, fresh], 2, ctx);
    expect(ids(result)[0]).toBe(fresh.id);
    expect(result[0].signals.lowExposure).toBe(1);
    expect(result[1].signals.lowExposure).toBeCloseTo(1 / 11, 5);
  });
});

describe("AdaptiveSelector: difficulty", () => {
  const fit = (topicScore: number, difficulty: Difficulty | null) => {
    const q = question(ORGANIC, { difficulty });
    return selector.select([q], 1, context({}, [mastery(ORGANIC, topicScore)]))[0].signals
      .difficultyFit;
  };

  it("matches the difficulty to the student's mastery of the topic", () => {
    expect(fit(10, "easy")).toBeGreaterThan(fit(10, "hard"));
    expect(fit(90, "hard")).toBeGreaterThan(fit(90, "easy"));
    expect(fit(50, "medium")).toBeCloseTo(1, 5);
  });

  it("is neutral for a question whose difficulty is unknown", () => {
    expect(fit(10, null)).toBe(ADAPTIVE_SELECTION_CONFIG.unknownDifficultyFit);
    expect(fit(90, null)).toBe(ADAPTIVE_SELECTION_CONFIG.unknownDifficultyFit);
  });
});

describe("AdaptiveSelector: variety", () => {
  it("does not let one topic fill the session while others have questions", () => {
    const candidates = [...many(ORGANIC, 30), ...many(STOICH, 30), ...many(ATOMIC, 30)];
    const ctx = context({}, [mastery(ORGANIC, 5), mastery(STOICH, 60), mastery(ATOMIC, 90)]);
    const picked = selector.select(candidates, 10, ctx).map((s) => s.question.topic);
    expect(picked.filter((t) => t === ORGANIC)).toHaveLength(6); // ceil(10 * 0.6)
    expect(new Set(picked).size).toBeGreaterThan(1);
  });

  it("lets a topic supply the whole session when it is the only one with questions", () => {
    expect(selector.select(many(ORGANIC, 20), 10, context())).toHaveLength(10);
  });

  it("fills the remaining places from the capped topic when other topics run out", () => {
    const candidates = [...many(ORGANIC, 30), ...many(STOICH, 2)];
    const ctx = context({}, [mastery(ORGANIC, 5), mastery(STOICH, 80)]);
    const picked = selector.select(candidates, 10, ctx).map((s) => s.question.topic);
    expect(picked).toHaveLength(10);
    expect(picked.filter((t) => t === STOICH)).toHaveLength(2);
  });

  it("breaks ties with a seeded order: stable for one seed, different across seeds", () => {
    const candidates = many(ORGANIC, 30);
    const a = ids(selector.select(candidates, 10, context({ seed: "a" })));
    expect(ids(selector.select(candidates, 10, context({ seed: "a" })))).toEqual(a);
    expect(ids(selector.select(candidates, 10, context({ seed: "b" })))).not.toEqual(a);
  });

  it("lets score beat the tie-break", () => {
    const [weakQ, ...rest] = [question(ORGANIC), ...many(ATOMIC, 20)];
    const ctx = context({ seed: "x" }, [mastery(ORGANIC, 10), mastery(ATOMIC, 90)]);
    expect(ids(selector.select([...rest, weakQ], 1, ctx))).toEqual([weakQ.id]);
  });
});

describe("AdaptiveSelector: scores and configuration", () => {
  it("reports each signal and a total between 0 and 1, best first", () => {
    const candidates = [...many(ORGANIC, 5), ...many(ATOMIC, 5)];
    const result = selector.select(
      candidates,
      10,
      context({}, [mastery(ORGANIC, 30), mastery(ATOMIC, 80)]),
    );
    for (const entry of result) {
      expect(entry.score).toBeGreaterThanOrEqual(0);
      expect(entry.score).toBeLessThanOrEqual(1);
      expect(Object.keys(entry.signals).sort()).toEqual([
        "difficultyFit",
        "dueReview",
        "lowExposure",
        "previousMistake",
        "recentWeakness",
        "weakTopic",
      ]);
    }
    expect(result[0].score).toBeGreaterThan(result[result.length - 1].score);
  });

  it("combines the signals with the configured weights", () => {
    const q = question(ORGANIC);
    const ctx = context(
      { progress: new Map([[q.id, progress({ attempts: 3, misses: 3, unresolved: true })]]) },
      [mastery(ORGANIC, 40, 0.3)],
    );
    const [{ score, signals }] = selector.select([q], 1, ctx);
    const w = ADAPTIVE_SELECTION_CONFIG.weights;
    const expected =
      w.weakTopic * signals.weakTopic +
      w.dueReview * signals.dueReview +
      w.previousMistake * signals.previousMistake +
      w.lowExposure * signals.lowExposure +
      w.recentWeakness * signals.recentWeakness +
      w.difficultyFit * signals.difficultyFit;
    expect(score).toBeCloseTo(expected, 10);
    expect(signals.weakTopic).toBeCloseTo(0.6, 5);
    expect(signals.recentWeakness).toBeCloseTo(0.7, 5);
  });

  it("uses an injected configuration", () => {
    const onlyExposure = new AdaptiveSelector({
      ...ADAPTIVE_SELECTION_CONFIG,
      weights: {
        weakTopic: 0,
        dueReview: 0,
        previousMistake: 0,
        lowExposure: 1,
        recentWeakness: 0,
        difficultyFit: 0,
      },
    });
    const fresh = question(ATOMIC);
    const worn = question(ORGANIC);
    const ctx = context({ progress: new Map([[worn.id, progress({ attempts: 8 })]]) }, [
      mastery(ORGANIC, 5),
      mastery(ATOMIC, 95),
    ]);
    expect(ids(onlyExposure.select([worn, fresh], 1, ctx))).toEqual([fresh.id]);
  });
});

describe("AdaptiveSelector: the reason each question was chosen", () => {
  const reasonOf = (q: CandidateQuestion, ctx: SelectionContext) =>
    selector.select([q], 1, ctx)[0].reason;

  it("names a mistake the student has not got right since", () => {
    const q = question(ORGANIC);
    const ctx = context(
      { progress: new Map([[q.id, progress({ misses: 3, unresolved: true })]]) },
      [mastery(ORGANIC, 80)],
    );
    expect(reasonOf(q, ctx)).toBe("previous_mistake");
  });

  it("names a review that has fallen due", () => {
    const q = question(ORGANIC);
    const ctx = context(
      { progress: new Map([[q.id, progress({ nextReviewAt: daysFromNow(-14) })]]) },
      [mastery(ORGANIC, 90)],
    );
    expect(reasonOf(q, ctx)).toBe("due_review");
  });

  it("names a weak topic the student has real results in", () => {
    const q = question(ORGANIC);
    const ctx = context({ progress: new Map([[q.id, progress()]]) }, [mastery(ORGANIC, 10, null)]);
    expect(reasonOf(q, ctx)).toBe("weak_topic");
  });

  it("calls a never-seen question in a topic with no results new, not a weak topic", () => {
    expect(reasonOf(question(STOICH), context())).toBe("new_question");
  });

  it("names recent weakness when only the last results are poor in a strong topic", () => {
    const q = question(ATOMIC);
    const ctx = context({ progress: new Map([[q.id, progress({ attempts: 9 })]]) }, [
      mastery(ATOMIC, 95, 0),
    ]);
    expect(reasonOf(q, ctx)).toBe("recent_weakness");
  });

  it("gives every selected question exactly one known reason", () => {
    const pool = [...many(ORGANIC, 5), ...many(STOICH, 5)];
    for (const picked of selector.select(pool, 6, context({}, [mastery(ORGANIC, 30)]))) {
      expect(SELECTION_REASONS).toContain(picked.reason);
    }
  });
});
