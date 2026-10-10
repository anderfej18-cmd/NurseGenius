import { describe, expect, it, vi } from "vitest";
import { ConflictError, LimitReachedError, NotFoundError, ValidationError } from "../errors";
import { MAX_OFFSET } from "../types";
import { ReportService, type ReportRepository } from "./report.service";
import { MAX_REPORTS_PER_DAY, type AdminReportRow, type ReportRow } from "./report.types";

const NOW = new Date("2026-10-06T15:30:00.000Z");
const USER = "user-1";
const ADMIN = "admin-1";

const mine = (n: number): ReportRow => ({
  id: `r${n}`,
  questionId: "q1",
  reason: "typo",
  details: null,
  status: "open",
  resolutionNote: null,
  createdAt: "2026-10-06T10:00:00Z",
  resolvedAt: null,
  question: { question_text: "Which drug?" },
});
const adminRow = (n: number): AdminReportRow => ({
  id: `r${n}`,
  questionId: "q1",
  reason: "incorrect_answer",
  details: "Key is wrong",
  status: "open",
  resolutionNote: null,
  createdAt: "2026-10-06T10:00:00Z",
  resolvedAt: null,
  reporterId: "u9",
  question: {
    topic: "Anatomy",
    question_text: "Which?",
    option_a: "a",
    option_b: "b",
    option_c: "c",
    option_d: "d",
    correct_answer: "B",
    rationale: "Because",
  },
});

function setup(overrides: Partial<ReportRepository> = {}) {
  const repository: ReportRepository = {
    questionExists: vi.fn().mockResolvedValue(true),
    countCreatedSince: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue("created"),
    listMine: vi
      .fn()
      .mockImplementation(async (_u: string, q: { limit: number; offset: number }) =>
        [mine(1), mine(2), mine(3)].slice(q.offset, q.offset + q.limit),
      ),
    listAll: vi.fn().mockResolvedValue([adminRow(1)]),
    resolve: vi.fn().mockResolvedValue("resolved"),
    ...overrides,
  };
  return { service: new ReportService({ repository, clock: () => NOW }), repository };
}

describe("ReportService.create", () => {
  it("files a report for an existing question", async () => {
    const { service, repository } = setup();
    await expect(
      service.create(USER, { questionId: "q1", reason: "typo", details: "  teh  " }),
    ).resolves.toEqual({ ok: true });
    expect(repository.create).toHaveBeenCalledWith(USER, {
      questionId: "q1",
      reason: "typo",
      details: "teh",
    });
  });

  it("refuses a question that does not exist", async () => {
    const { service, repository } = setup({ questionExists: vi.fn().mockResolvedValue(false) });
    await expect(
      service.create(USER, { questionId: "nope", reason: "typo" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("treats a repeat of the same open report as a conflict", async () => {
    const { service } = setup({ create: vi.fn().mockResolvedValue("duplicate") });
    await expect(service.create(USER, { questionId: "q1", reason: "typo" })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("limits how many reports a student can file per day, counting from the start of the UTC day", async () => {
    const { service, repository } = setup({
      countCreatedSince: vi.fn().mockResolvedValue(MAX_REPORTS_PER_DAY),
    });
    await expect(service.create(USER, { questionId: "q1", reason: "typo" })).rejects.toBeInstanceOf(
      LimitReachedError,
    );
    expect(repository.countCreatedSince).toHaveBeenCalledWith(USER, "2026-10-06T00:00:00.000Z");
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("rejects over-long details", async () => {
    const { service } = setup();
    await expect(
      service.create(USER, { questionId: "q1", reason: "other", details: "x".repeat(1001) }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("ReportService.listMine", () => {
  it("returns the student's own reports with a next offset when more exist", async () => {
    const { service, repository } = setup();
    const page = await service.listMine(USER, { limit: 2 });
    expect(vi.mocked(repository.listMine).mock.calls[0][0]).toBe(USER);
    expect(page.items).toHaveLength(2);
    expect(page.nextOffset).toBe(2);
    expect(JSON.stringify(page)).not.toMatch(/correct_answer|reporterId/);
  });

  it("rejects an out-of-range offset", async () => {
    const { service } = setup();
    await expect(service.listMine(USER, { offset: MAX_OFFSET + 1 })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe("ReportService admin operations", () => {
  it("lists reports with the question and key for the reviewer", async () => {
    const { service, repository } = setup();
    const page = await service.listAll({ status: "open" }, { limit: 10 });
    expect(page.items[0]).toMatchObject({ reporterId: "u9", question: { correct_answer: "B" } });
    expect(vi.mocked(repository.listAll).mock.calls[0][0]).toMatchObject({
      status: "open",
      limit: 11,
      offset: 0,
    });
  });

  it("resolves an open report and records who and when", async () => {
    const { service, repository } = setup();
    await expect(
      service.resolve(ADMIN, { reportId: "r1", status: "resolved", note: " fixed " }),
    ).resolves.toEqual({ ok: true });
    expect(repository.resolve).toHaveBeenCalledWith({
      reportId: "r1",
      adminId: ADMIN,
      status: "resolved",
      note: "fixed",
      at: NOW.toISOString(),
    });
  });

  it("reports a missing report as not found and a closed one as a conflict", async () => {
    await expect(
      setup({ resolve: vi.fn().mockResolvedValue("not_found") }).service.resolve(ADMIN, {
        reportId: "x",
        status: "dismissed",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      setup({ resolve: vi.fn().mockResolvedValue("not_open") }).service.resolve(ADMIN, {
        reportId: "r1",
        status: "dismissed",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects an over-long resolution note", async () => {
    const { service, repository } = setup();
    await expect(
      service.resolve(ADMIN, { reportId: "r1", status: "resolved", note: "n".repeat(1001) }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repository.resolve).not.toHaveBeenCalled();
  });
});
