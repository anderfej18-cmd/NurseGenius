import { describe, expect, it, vi } from "vitest";
import type { AttemptRecord } from "../attempt.types";
import { PerformanceService } from "./performance.service";

const NOW = new Date("2026-10-10T12:00:00.000Z");

const attempt = (i: number): AttemptRecord => ({
  questionId: `q-${i}`,
  topic: i % 2 === 0 ? "A" : "B",
  examType: "RN",
  sessionId: `s-${i}`,
  sessionType: "mixed",
  correct: i % 3 !== 0,
  answeredAt: new Date(NOW.getTime() - (1 + (i % 20)) * 24 * 60 * 60 * 1000),
  difficulty: null,
  confidence: null,
  timeSpentMs: null,
});

function setup(options: { attempts?: AttemptRecord[]; failCounts?: boolean } = {}) {
  const attempts = options.attempts ?? Array.from({ length: 60 }, (_, i) => attempt(i));
  const history = { load: vi.fn(async (_userId: string) => attempts) };
  const reviews = { countDue: vi.fn(async (_userId: string) => 4) };
  const store = {
    countUnresolvedMistakes: vi.fn(async (_userId: string) => 6),
    countUnverifiedExams: vi.fn(async (_userId: string) => 2),
  };
  const service = new PerformanceService({ history, reviews, store, clock: () => NOW });
  return { service, history, reviews, store };
}

describe("PerformanceService.analyze", () => {
  it("analyses the named student's answers together with their review backlog and unverified tests", async () => {
    const { service, history, reviews, store } = setup();
    const report = await service.analyze("user-1");

    expect(history.load).toHaveBeenCalledWith("user-1");
    expect(reviews.countDue).toHaveBeenCalledWith("user-1");
    expect(store.countUnresolvedMistakes).toHaveBeenCalledWith("user-1");
    expect(store.countUnverifiedExams).toHaveBeenCalledWith("user-1");
    expect(report.attempts).toBe(60);
    expect(report.sufficientEvidence).toBe(true);
    expect(report.reviews).toEqual({ due: 4, unresolvedMistakes: 6 });
    expect(report.unverifiedExams).toBe(2);
  });

  it("changes when new answers are recorded", async () => {
    const before = await setup({
      attempts: Array.from({ length: 31 }, (_, i) => attempt(i)),
    }).service.analyze("u");
    const after = await setup({
      attempts: Array.from({ length: 60 }, (_, i) => attempt(i)),
    }).service.analyze("u");
    expect(before.attempts).toBe(31);
    expect(after.attempts).toBe(60);
  });

  it("gives an honest empty report to a student with no history", async () => {
    const report = await setup({ attempts: [] }).service.analyze("new-student");
    expect(report).toMatchObject({ attempts: 0, sufficientEvidence: false, accuracy: null });
  });
});
