import { describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@/lib/app-errors";
import { SIMILAR_CONFIG } from "./similar.config";
import type { SimilarCandidate, SimilarSource } from "./similar-questions";
import { SimilarQuestionService } from "./similar.service";

const USER = "user-1";
const source: SimilarSource = {
  id: "q-source",
  examType: "RN",
  topic: "Anatomy",
  subtopicId: "sub-1",
  difficulty: "medium",
  tags: ["bones"],
  questionText: "Q?",
};

let counter = 0;
const candidate = (overrides: Partial<SimilarCandidate> = {}): SimilarCandidate => {
  counter += 1;
  return {
    id: `c${String(counter).padStart(3, "0")}`,
    examType: "RN",
    topic: "Anatomy",
    subtopicId: null,
    difficulty: null,
    tags: [],
    year: 2024,
    question: { question_text: "Q?", option_a: "a", option_b: "b", option_c: "c", option_d: "d" },
    ...overrides,
  };
};

function setup(
  options: {
    attempted?: string[];
    source?: SimilarSource | null;
    candidates?: SimilarCandidate[];
  } = {},
) {
  const store = {
    getSource: vi.fn().mockResolvedValue(options.source === undefined ? source : options.source),
    listCandidates: vi.fn().mockResolvedValue(options.candidates ?? []),
  };
  const attempted = options.attempted ?? [source.id];
  const progress = {
    listProgress: vi.fn().mockResolvedValue(new Map(attempted.map((id) => [id, { attempts: 1 }]))),
  };
  return { service: new SimilarQuestionService({ store, progress }), store, progress };
}

describe("SimilarQuestionService.find", () => {
  it("returns the questions most like one the student has attempted, with why", async () => {
    const closer = candidate({ subtopicId: "sub-1", difficulty: "medium" });
    const farther = candidate();
    const { service, store } = setup({ candidates: [farther, closer] });
    const result = await service.find(USER, source.id);

    expect(store.listCandidates).toHaveBeenCalledWith(source, SIMILAR_CONFIG.maxCandidates);
    expect(result.source).toEqual({
      id: source.id,
      topic: "Anatomy",
      subtopicId: "sub-1",
      difficulty: "medium",
    });
    expect(result.items.map((i) => i.id)).toEqual([closer.id, farther.id]);
    expect(result.items[0].reasons).toEqual(["same_topic", "same_subtopic", "same_difficulty"]);
    expect(result.items[0].score).toBeGreaterThan(result.items[1].score);
  });

  it("marks the questions the student has already answered, and lists unseen ones first among equals", async () => {
    const seen = candidate();
    const unseen = candidate();
    const { service } = setup({ attempted: [source.id, seen.id], candidates: [seen, unseen] });
    const { items } = await service.find(USER, source.id);
    expect(items.map((i) => [i.id, i.attempted])).toEqual([
      [unseen.id, false],
      [seen.id, true],
    ]);
  });

  it("refuses a question the student has not attempted, without revealing whether it exists", async () => {
    const { service, store } = setup({ attempted: [] });
    await expect(service.find(USER, "q-never-seen")).rejects.toBeInstanceOf(NotFoundError);
    expect(store.getSource).not.toHaveBeenCalled();
    expect(store.listCandidates).not.toHaveBeenCalled();
  });

  it("treats a question whose record is gone as not found", async () => {
    const { service } = setup({ source: null });
    await expect(service.find(USER, source.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("returns an empty list when nothing similar exists", async () => {
    const { service } = setup({ candidates: [] });
    expect((await service.find(USER, source.id)).items).toEqual([]);
  });

  it("applies a default limit, and caps a large request", async () => {
    const many = Array.from({ length: 40 }, () => candidate());
    const { service } = setup({ candidates: many });
    expect((await service.find(USER, source.id)).items).toHaveLength(SIMILAR_CONFIG.defaultLimit);
    expect((await service.find(USER, source.id, 1000)).items).toHaveLength(SIMILAR_CONFIG.maxLimit);
    expect((await service.find(USER, source.id, 0)).items).toHaveLength(1);
  });

  it("rounds the score to two decimals", async () => {
    const { service } = setup({ candidates: [candidate({ difficulty: "hard" })] });
    const [item] = (await service.find(USER, source.id)).items;
    expect(item.score).toBe(Math.round(item.score * 100) / 100);
  });

  it("returns question content without any answer key", async () => {
    const { service } = setup({ candidates: [candidate()] });
    expect(JSON.stringify(await service.find(USER, source.id))).not.toMatch(
      /correct_answer|rationale/,
    );
  });

  it("reads only the named student's progress", async () => {
    const { service, progress } = setup();
    await service.find("student-42", source.id);
    expect(progress.listProgress).toHaveBeenCalledWith("student-42");
  });
});
