import { describe, expect, it, vi } from "vitest";
import { ValidationError } from "../errors";
import { MAX_OFFSET } from "../types";
import { MistakeService, type MistakeRepository } from "./mistake.service";
import type { MistakeRow } from "./mistake.types";

const NOW = new Date("2026-10-06T10:00:00.000Z");
const USER = "user-1";

const row = (n: number, overrides: Partial<MistakeRow> = {}): MistakeRow => ({
  questionId: `q${n}`,
  misses: 2,
  attempts: 3,
  correct: 1,
  lastMissedAt: "2026-10-05T10:00:00.000Z",
  lastAnswer: "C",
  unresolved: true,
  question: {
    id: `q${n}`,
    exam_type: "RN",
    topic: "Pharmacology",
    question_text: `Q${n}?`,
    option_a: "a",
    option_b: "b",
    option_c: "c",
    option_d: "d",
    correct_answer: "A",
    rationale: "Because.",
  },
  ...overrides,
});

function setup(rows: MistakeRow[] = [row(1), row(2)], active: string[] = []) {
  const repository: MistakeRepository = {
    list: vi
      .fn()
      .mockImplementation(async (_user: string, query: { limit: number; offset: number }) =>
        rows.slice(query.offset, query.offset + query.limit),
      ),
    activeSessionQuestionIds: vi.fn().mockResolvedValue(active),
  };
  return { service: new MistakeService({ repository, clock: () => NOW }), repository };
}
const specOf = (repository: MistakeRepository) => vi.mocked(repository.list).mock.calls[0][1];

describe("MistakeService views", () => {
  it.each([
    ["all", { sort: "recent", minMisses: 1, unresolvedOnly: false, since: null }],
    ["most_repeated", { sort: "most_missed", minMisses: 1, unresolvedOnly: false, since: null }],
    [
      "recent",
      { sort: "recent", minMisses: 1, unresolvedOnly: false, since: "2026-09-29T10:00:00.000Z" },
    ],
    ["repeatedly_failed", { sort: "most_missed", minMisses: 2, unresolvedOnly: true, since: null }],
  ] as const)("translates the %s view into filters", async (view, expected) => {
    const { service, repository } = setup();
    await service.list(USER, { view });
    expect(specOf(repository).spec).toEqual(expected);
  });

  it("passes the topic and exam type filters through", async () => {
    const { service, repository } = setup();
    await service.list(USER, { view: "all", topic: "Anatomy", examType: "RM" });
    expect(specOf(repository)).toMatchObject({ topic: "Anatomy", examType: "RM" });
  });

  it("always scopes the query to the requesting student", async () => {
    const { service, repository } = setup();
    await service.list("student-42", { view: "all" });
    expect(vi.mocked(repository.list).mock.calls[0][0]).toBe("student-42");
    expect(repository.activeSessionQuestionIds).toHaveBeenCalledWith("student-42");
  });
});

describe("MistakeService pagination", () => {
  const many = Array.from({ length: 7 }, (_, i) => row(i + 1));

  it("returns a next offset only when more rows exist", async () => {
    const { service } = setup(many);
    const first = await service.list(USER, { view: "all", limit: 5 });
    expect(first.items).toHaveLength(5);
    expect(first.nextOffset).toBe(5);
    const second = await service.list(USER, { view: "all", limit: 5, offset: 5 });
    expect(second.items).toHaveLength(2);
    expect(second.nextOffset).toBeNull();
  });

  it("caps the page size and rejects absurd offsets", async () => {
    const { service, repository } = setup(many);
    await service.list(USER, { view: "all", limit: 9999 });
    expect(specOf(repository).limit).toBe(50 + 1);
    await expect(
      service.list(USER, { view: "all", offset: MAX_OFFSET + 1 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("handles a student with no mistakes", async () => {
    const { service } = setup([]);
    await expect(service.list(USER, { view: "repeatedly_failed" })).resolves.toEqual({
      items: [],
      nextOffset: null,
    });
  });
});

describe("MistakeService answer visibility", () => {
  it("shows the key and rationale for questions the student already finished", async () => {
    const { service } = setup([row(1)]);
    const [item] = (await service.list(USER, { view: "all" })).items;
    expect(item).toMatchObject({
      answerWithheld: false,
      question: { correct_answer: "A", rationale: "Because." },
      unresolved: true,
      misses: 2,
    });
  });

  it("withholds the key for a question that is part of the running exam", async () => {
    const { service } = setup([row(1), row(2)], ["q2"]);
    const items = (await service.list(USER, { view: "all" })).items;
    expect(items[0].answerWithheld).toBe(false);
    expect(items[1]).toMatchObject({
      answerWithheld: true,
      question: { correct_answer: null, rationale: null },
    });
    expect(JSON.stringify(items[1])).not.toContain("Because.");
  });

  it("does not expose internal row fields", async () => {
    const { service } = setup([row(1)]);
    const [item] = (await service.list(USER, { view: "all" })).items;
    expect(Object.keys(item).sort()).toEqual([
      "answerWithheld",
      "attempts",
      "correct",
      "examType",
      "lastAnswer",
      "lastMissedAt",
      "misses",
      "question",
      "questionId",
      "topic",
      "unresolved",
    ]);
  });
});
