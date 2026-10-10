import { describe, expect, it } from "vitest";
import { SIMILAR_CONFIG } from "./similar.config";
import { rankSimilar, type SimilarCandidate, type SimilarSource } from "./similar-questions";

const source: SimilarSource = {
  id: "source",
  examType: "RN",
  topic: "Pharmacology",
  subtopicId: "sub-1",
  difficulty: "medium",
  tags: ["drugs", "dosage", "safety"],
  questionText: "Q?",
};

let counter = 0;
const candidate = (overrides: Partial<SimilarCandidate> = {}): SimilarCandidate => {
  counter += 1;
  return {
    id: `c${String(counter).padStart(3, "0")}`,
    examType: "RN",
    topic: "Pharmacology",
    subtopicId: null,
    difficulty: null,
    tags: [],
    year: null,
    question: { question_text: "Q?", option_a: "a", option_b: "b", option_c: "c", option_d: "d" },
    ...overrides,
  };
};
const rank = (candidates: SimilarCandidate[], limit = 10, attempted = new Set<string>()) =>
  rankSimilar(source, candidates, attempted, limit);
const ids = (ranked: ReadonlyArray<{ candidate: SimilarCandidate }>) =>
  ranked.map((r) => r.candidate.id);

describe("rankSimilar: what makes questions similar", () => {
  it("ranks a question from the same subtopic above one from the same topic only", () => {
    const sameSubtopic = candidate({ subtopicId: "sub-1" });
    const sameTopic = candidate();
    expect(ids(rank([sameTopic, sameSubtopic]))).toEqual([sameSubtopic.id, sameTopic.id]);
  });

  it("ranks a question from another topic by the subtopic alone when the subtopic matches", () => {
    const other = candidate({ topic: "Anatomy", subtopicId: "sub-1" });
    const [ranked] = rank([other]);
    expect(ranked.reasons).toEqual(["same_subtopic"]);
  });

  it("prefers the same difficulty, then a neighbouring one, then an unknown one", () => {
    const same = candidate({ difficulty: "medium" });
    const neighbour = candidate({ difficulty: "hard" });
    const unknown = candidate({ difficulty: null });
    const [first, second, third] = rank([unknown, neighbour, same]);
    expect([first.candidate.id, second.candidate.id, third.candidate.id]).toEqual([
      same.id,
      neighbour.id,
      unknown.id,
    ]);
    expect(first.reasons).toContain("same_difficulty");
    expect(second.reasons).toContain("adjacent_difficulty");
    expect(third.reasons).toEqual(["same_topic"]);
  });

  it("counts easy and hard as neighbours of medium", () => {
    const [easy, hard] = [candidate({ difficulty: "easy" }), candidate({ difficulty: "hard" })];
    expect(rank([easy, hard]).map((r) => r.reasons.includes("adjacent_difficulty"))).toEqual([
      true,
      true,
    ]);
  });

  it("treats easy and hard as not adjacent", () => {
    const easySource: SimilarSource = { ...source, difficulty: "easy" };
    const [ranked] = rankSimilar(easySource, [candidate({ difficulty: "hard" })], new Set(), 5);
    expect(ranked.reasons).not.toContain("adjacent_difficulty");
  });

  it("rewards shared tags, up to the configured maximum", () => {
    const one = candidate({ tags: ["drugs"] });
    const two = candidate({ tags: ["drugs", "dosage"] });
    const three = candidate({ tags: ["drugs", "dosage", "safety"] });
    const none = candidate({ tags: ["other"] });
    const ranked = rank([none, one, three, two]);
    expect(ranked[0].score).toBeGreaterThan(ranked[ranked.length - 1].score);
    expect(ranked.find((r) => r.candidate.id === three.id)?.score).toBe(
      ranked.find((r) => r.candidate.id === two.id)?.score,
    );
    expect(ranked.find((r) => r.candidate.id === one.id)?.reasons).toContain("shared_tags");
    expect(ranked.find((r) => r.candidate.id === none.id)?.reasons).not.toContain("shared_tags");
  });

  it("scores from 0 to 1, the best possible match being 1", () => {
    const wording = "heparin anticoagulant infusion monitoring thrombocytopenia";
    const perfect = candidate({
      subtopicId: "sub-1",
      difficulty: "medium",
      tags: ["drugs", "dosage"],
      question: { ...candidate().question, question_text: wording },
    });
    const [ranked] = rankSimilar({ ...source, questionText: wording }, [perfect], new Set(), 10);
    expect(ranked.score).toBe(1);
    const points = SIMILAR_CONFIG.points;
    const max =
      points.sameTopic +
      points.sameSubtopic +
      points.sameDifficulty +
      SIMILAR_CONFIG.maxSharedTags * points.sharedTag +
      points.similarWording;
    expect(max).toBe(8.5);
  });
});

describe("rankSimilar: who is eligible", () => {
  it("never returns the question itself", () => {
    const itself = candidate({ id: "source", subtopicId: "sub-1" });
    expect(rank([itself, candidate()])).toHaveLength(1);
  });

  it("never mixes exam types", () => {
    expect(rank([candidate({ examType: "RM", subtopicId: "sub-1" })])).toEqual([]);
  });

  it("ignores a candidate that shares neither topic nor subtopic", () => {
    expect(rank([candidate({ topic: "Anatomy", subtopicId: "other" })])).toEqual([]);
  });

  it("returns nothing when there are no candidates", () => {
    expect(rank([])).toEqual([]);
  });
});

describe("rankSimilar: ordering, limit and determinism", () => {
  it("puts questions the student has not seen ahead of seen ones of equal similarity", () => {
    const seen = candidate();
    const unseen = candidate();
    const ranked = rank([seen, unseen], 5, new Set([seen.id]));
    expect(ids(ranked)).toEqual([unseen.id, seen.id]);
    expect(ranked.map((r) => r.attempted)).toEqual([false, true]);
  });

  it("does not let being unseen outweigh being more similar", () => {
    const seenButCloser = candidate({ subtopicId: "sub-1" });
    const unseenButFarther = candidate();
    expect(ids(rank([unseenButFarther, seenButCloser], 5, new Set([seenButCloser.id])))[0]).toBe(
      seenButCloser.id,
    );
  });

  it("applies the limit and returns fewer when fewer are eligible", () => {
    const candidates = Array.from({ length: 8 }, () => candidate());
    expect(rank(candidates, 3)).toHaveLength(3);
    expect(rank(candidates.slice(0, 2), 10)).toHaveLength(2);
    expect(rank(candidates, 0)).toEqual([]);
  });

  it("is deterministic whatever the input order, and leaves its input alone", () => {
    const candidates = Object.freeze(
      Array.from({ length: 12 }, (_, i) =>
        candidate({ difficulty: i % 3 === 0 ? "medium" : null }),
      ),
    );
    expect(ids(rank([...candidates].reverse()))).toEqual(ids(rank([...candidates])));
    expect(candidates).toHaveLength(12);
  });
});

describe("rankSimilar: similar wording", () => {
  const wording = (text: string) => ({ ...candidate().question, question_text: text });
  const withText = {
    ...source,
    questionText: "Furosemide causes hypokalemia; monitor potassium and loop diuretic dosing",
  };

  it("ranks a question that says the same thing in similar words above an unrelated one, among equals", () => {
    const alike = candidate({
      question: wording("Loop diuretic furosemide lowers potassium: hypokalemia monitoring"),
    });
    const unrelated = candidate({ question: wording("Insulin sliding scale before meals") });
    const ranked = rankSimilar(withText, [unrelated, alike], new Set(), 10);
    expect(ranked.map((r) => r.candidate.id)).toEqual([alike.id, unrelated.id]);
    expect(ranked[0].reasons).toContain("similar_wording");
    expect(ranked[1].reasons).not.toContain("similar_wording");
  });

  it("never makes a question from another topic eligible by wording alone", () => {
    const other = candidate({
      topic: "Anatomy",
      question: wording(
        "Furosemide causes hypokalemia; monitor potassium and loop diuretic dosing",
      ),
    });
    expect(rankSimilar(withText, [other], new Set(), 10)).toEqual([]);
  });

  it("does not return a question's answer key, only its wording and options", () => {
    const [ranked] = rankSimilar(withText, [candidate()], new Set(), 10);
    expect(Object.keys(ranked.candidate.question).sort()).toEqual([
      "option_a",
      "option_b",
      "option_c",
      "option_d",
      "question_text",
    ]);
  });
});
