import { describe, expect, it, vi } from "vitest";
import { LimitReachedError, NotFoundError, ValidationError } from "../errors";
import { MAX_OFFSET } from "../types";
import { BookmarkService, type BookmarkRepository } from "./bookmark.service";
import { MAX_BOOKMARKS_PER_STUDENT, type BookmarkRow } from "./bookmark.types";

const USER = "user-1";
const row = (n: number): BookmarkRow => ({
  questionId: `q${n}`,
  note: n === 1 ? "revise" : null,
  createdAt: "2026-10-05T10:00:00Z",
  question: {
    exam_type: "RN",
    topic: "Anatomy",
    question_text: `Q${n}?`,
    option_a: "a",
    option_b: "b",
    option_c: "c",
    option_d: "d",
  },
});

function setup(overrides: Partial<BookmarkRepository> = {}, rows = [row(1), row(2)]) {
  const repository: BookmarkRepository = {
    questionIsActive: vi.fn().mockResolvedValue(true),
    has: vi.fn().mockResolvedValue(false),
    count: vi.fn().mockResolvedValue(3),
    upsert: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(true),
    list: vi
      .fn()
      .mockImplementation(async (_user: string, query: { limit: number; offset: number }) =>
        rows.slice(query.offset, query.offset + query.limit),
      ),
    ...overrides,
  };
  return { service: new BookmarkService(repository), repository };
}

describe("BookmarkService.add", () => {
  it("bookmarks an active question for the student", async () => {
    const { service, repository } = setup();
    await expect(service.add(USER, { questionId: "q1", note: "  revise  " })).resolves.toEqual({
      ok: true,
    });
    expect(repository.upsert).toHaveBeenCalledWith(USER, "q1", "revise");
  });

  it("stores no note when it is blank", async () => {
    const { service, repository } = setup();
    await service.add(USER, { questionId: "q1", note: "   " });
    expect(repository.upsert).toHaveBeenCalledWith(USER, "q1", null);
  });

  it("refuses an unknown or retired question", async () => {
    const { service, repository } = setup({ questionIsActive: vi.fn().mockResolvedValue(false) });
    await expect(service.add(USER, { questionId: "nope" })).rejects.toBeInstanceOf(NotFoundError);
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it("stops a student who already holds the maximum number of bookmarks", async () => {
    const { service, repository } = setup({
      count: vi.fn().mockResolvedValue(MAX_BOOKMARKS_PER_STUDENT),
    });
    await expect(service.add(USER, { questionId: "q1" })).rejects.toBeInstanceOf(LimitReachedError);
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it("still lets the student edit the note of an existing bookmark at the maximum", async () => {
    const { service, repository } = setup({
      count: vi.fn().mockResolvedValue(MAX_BOOKMARKS_PER_STUDENT),
      has: vi.fn().mockResolvedValue(true),
    });
    await expect(service.add(USER, { questionId: "q1", note: "new" })).resolves.toEqual({
      ok: true,
    });
    expect(repository.upsert).toHaveBeenCalled();
  });

  it("rejects an over-long note", async () => {
    const { service } = setup();
    await expect(
      service.add(USER, { questionId: "q1", note: "x".repeat(501) }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("BookmarkService.remove", () => {
  it("removes the student's own bookmark and reports whether anything was removed", async () => {
    const { service, repository } = setup();
    await expect(service.remove(USER, "q1")).resolves.toEqual({ removed: true });
    expect(repository.remove).toHaveBeenCalledWith(USER, "q1");
  });

  it("is idempotent when there is nothing to remove", async () => {
    const { service } = setup({ remove: vi.fn().mockResolvedValue(false) });
    await expect(service.remove(USER, "q1")).resolves.toEqual({ removed: false });
  });
});

describe("BookmarkService.list", () => {
  it("scopes to the student and returns question content without the answer key", async () => {
    const { service, repository } = setup();
    const page = await service.list(USER, {});
    expect(vi.mocked(repository.list).mock.calls[0][0]).toBe(USER);
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({
      questionId: "q1",
      note: "revise",
      examType: "RN",
      topic: "Anatomy",
    });
    expect(JSON.stringify(page)).not.toMatch(/correct_answer|rationale/);
  });

  it("filters, paginates and bounds the request", async () => {
    const many = Array.from({ length: 7 }, (_, i) => row(i + 1));
    const { service, repository } = setup({}, many);
    const first = await service.list(USER, { topic: "Anatomy", examType: "RN", limit: 5 });
    expect(first.nextOffset).toBe(5);
    expect(vi.mocked(repository.list).mock.calls[0][1]).toMatchObject({
      topic: "Anatomy",
      examType: "RN",
      limit: 6,
      offset: 0,
    });
    expect((await service.list(USER, { limit: 5, offset: 5 })).nextOffset).toBeNull();
    await service.list(USER, { limit: 9999 });
    expect(vi.mocked(repository.list).mock.calls[2][1].limit).toBe(50 + 1);
    await expect(service.list(USER, { offset: MAX_OFFSET + 1 })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
