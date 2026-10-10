import { describe, expect, it, vi } from "vitest";
import { ValidationError } from "../errors";
import { CatalogService, type CatalogRepository } from "./catalog.service";
import type { CatalogRow, CatalogRowWithKey } from "./catalog.types";

const row = (n: number, overrides: Partial<CatalogRowWithKey> = {}): CatalogRowWithKey => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  exam_type: "RN",
  topic: "Pharmacology",
  subtopic_id: null,
  year: 2024,
  difficulty: "medium",
  tags: ["drugs"],
  status: "active",
  source: null,
  updated_at: "2026-10-01T00:00:00Z",
  question_text: `Question ${n}?`,
  option_a: "a",
  option_b: "b",
  option_c: "c",
  option_d: "d",
  correct_answer: "C",
  rationale: "Hidden rationale",
  ...overrides,
});
const toSafe = ({ correct_answer: _k, rationale: _r, ...safe }: CatalogRowWithKey): CatalogRow =>
  safe;

function setup(rows: CatalogRowWithKey[] = [row(1), row(2), row(3)]) {
  const repository: CatalogRepository = {
    listSafe: vi
      .fn()
      .mockImplementation(async (query: { limit: number }) =>
        rows.slice(0, query.limit).map(toSafe),
      ),
    listWithKey: vi
      .fn()
      .mockImplementation(async (query: { limit: number }) => rows.slice(0, query.limit)),
    topicCounts: vi.fn().mockResolvedValue([
      { topic: "Anatomy", total: 12 },
      { topic: "Pharmacology", total: 7 },
    ]),
  };
  return { service: new CatalogService(repository), repository };
}

describe("CatalogService.listForStudent", () => {
  it("never returns the answer key or rationale", async () => {
    const { service, repository } = setup();
    const page = await service.listForStudent({ examType: "RN" }, { limit: 10 });
    expect(page.items).toHaveLength(3);
    expect(JSON.stringify(page)).not.toMatch(/correct_answer|rationale|Hidden/);
    expect(repository.listWithKey).not.toHaveBeenCalled();
  });

  it("only ever lists active questions, even if a student asks for retired ones", async () => {
    const { service, repository } = setup();
    await service.listForStudent({ examType: "RN", status: "retired" }, { limit: 10 });
    expect(vi.mocked(repository.listSafe).mock.calls[0][0].filter.status).toBe("active");
  });

  it("caps the page size and fetches one extra row to know whether more exist", async () => {
    const { service, repository } = setup();
    await service.listForStudent({ examType: "RN" }, { limit: 10_000 });
    expect(vi.mocked(repository.listSafe).mock.calls[0][0].limit).toBe(50 + 1);
    await service.listForStudent({ examType: "RN" }, {});
    expect(vi.mocked(repository.listSafe).mock.calls[1][0].limit).toBe(20 + 1);
  });

  it("returns a cursor only when there is another page", async () => {
    const many = Array.from({ length: 6 }, (_, i) => row(i + 1));
    const { service } = setup(many);
    const first = await service.listForStudent({ examType: "RN" }, { limit: 5 });
    expect(first.items).toHaveLength(5);
    expect(first.nextCursor).toBe(first.items[4].id);
    const last = await service.listForStudent({ examType: "RN" }, { limit: 10 });
    expect(last.nextCursor).toBeNull();
  });

  it("passes the cursor and every filter through", async () => {
    const { service, repository } = setup();
    const filter = {
      examType: "RM" as const,
      topics: ["Midwifery"],
      subtopicIds: ["s1"],
      yearFrom: 2018,
      yearTo: 2025,
      difficulty: ["easy" as const, "hard" as const],
    };
    await service.listForStudent(filter, { cursor: "abc", limit: 5 });
    expect(vi.mocked(repository.listSafe).mock.calls[0][0]).toMatchObject({
      cursor: "abc",
      filter: { ...filter, status: "active" },
    });
  });

  it("rejects an impossible year range", async () => {
    const { service, repository } = setup();
    await expect(
      service.listForStudent({ examType: "RN", yearFrom: 2025, yearTo: 2018 }, {}),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repository.listSafe).not.toHaveBeenCalled();
  });

  it("returns an empty page for an empty result", async () => {
    const { service } = setup([]);
    await expect(service.listForStudent({ examType: "RN" }, {})).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
  });
});

describe("CatalogService.listForAdmin", () => {
  it("includes the answer key and allows larger pages and any status", async () => {
    const { service, repository } = setup();
    const page = await service.listForAdmin({ examType: "RN", status: "all" }, { limit: 10_000 });
    expect(page.items[0]).toMatchObject({ correct_answer: "C", rationale: "Hidden rationale" });
    const query = vi.mocked(repository.listWithKey).mock.calls[0][0];
    expect(query.limit).toBe(500 + 1);
    expect(query.filter.status).toBe("all");
  });
});

describe("CatalogService.topicCounts", () => {
  it("returns a topic to count map for the exam type", async () => {
    const { service, repository } = setup();
    await expect(service.topicCounts("RN")).resolves.toEqual({ Anatomy: 12, Pharmacology: 7 });
    expect(repository.topicCounts).toHaveBeenCalledWith("RN");
  });
});
