import { describe, expect, it, vi } from "vitest";
import type { AttemptRecord } from "./attempt.types";
import { LearningHistoryService, type AttemptSource } from "./learning-history.service";

const attempt = (questionId: string, difficulty: AttemptRecord["difficulty"]): AttemptRecord => ({
  questionId,
  topic: "Anatomy",
  examType: "RN",
  sessionId: "s1",
  sessionType: "mixed",
  correct: true,
  answeredAt: new Date("2026-10-05T10:00:00.000Z"),
  difficulty,
  confidence: null,
  timeSpentMs: null,
});

function setup(
  attempts: AttemptRecord[],
  stats: Array<[string, { attempts: number; correct: number }]> = [],
) {
  const source: AttemptSource = {
    list: vi.fn().mockResolvedValue(attempts),
    questionStats: vi.fn().mockResolvedValue(new Map(stats)),
  };
  return { service: new LearningHistoryService(source), source };
}

describe("LearningHistoryService.load", () => {
  it("fills in difficulty from all students' results for questions without one", async () => {
    const { service, source } = setup(
      [attempt("q1", null), attempt("q2", null)],
      [["q1", { attempts: 50, correct: 10 }]],
    );
    const loaded = await service.load("user-1");
    expect(source.questionStats).toHaveBeenCalledWith(["q1", "q2"]);
    expect(loaded.map((a) => a.difficulty)).toEqual(["hard", null]); // q2 has no outcome data: stays unknown
  });

  it("keeps a difficulty an admin set and does not ask about it", async () => {
    const { service, source } = setup([attempt("q1", "medium"), attempt("q2", null)]);
    const loaded = await service.load("user-1");
    expect(source.questionStats).toHaveBeenCalledWith(["q2"]);
    expect(loaded[0].difficulty).toBe("medium");
  });

  it("skips the statistics query when every difficulty is known", async () => {
    const { service, source } = setup([attempt("q1", "easy")]);
    await service.load("user-1");
    expect(source.questionStats).not.toHaveBeenCalled();
  });

  it("asks about each question once even when it was attempted several times", async () => {
    const { service, source } = setup([
      attempt("q1", null),
      attempt("q1", null),
      attempt("q1", null),
    ]);
    await service.load("user-1");
    expect(source.questionStats).toHaveBeenCalledWith(["q1"]);
  });

  it("reads only the named student's history and passes the options on", async () => {
    const { service, source } = setup([]);
    const since = new Date("2026-09-01T00:00:00.000Z");
    await service.load("user-9", { since, limit: 100 });
    expect(source.list).toHaveBeenCalledWith("user-9", { since, limit: 100 });
  });

  it("returns an empty history for a student who has not answered anything", async () => {
    const { service, source } = setup([]);
    expect(await service.load("user-1")).toEqual([]);
    expect(source.questionStats).not.toHaveBeenCalled();
  });

  it("does not change the attempts the source returned", async () => {
    const original = [attempt("q1", null)];
    const { service } = setup(original, [["q1", { attempts: 50, correct: 50 }]]);
    await service.load("user-1");
    expect(original[0].difficulty).toBeNull();
  });
});
