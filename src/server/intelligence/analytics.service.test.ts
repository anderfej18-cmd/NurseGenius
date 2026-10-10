import { describe, expect, it, vi } from "vitest";
import type { AttemptRecord } from "./attempt.types";
import { AnalyticsService } from "./analytics.service";
import { ConfidenceAnalyticsService } from "./confidence/confidence.analytics";
import { MasteryService } from "./mastery/mastery.service";
import { TimeAnalyticsService } from "./time/time-analytics.service";

const NOW = new Date("2026-10-10T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

const attempt = (daysAgo: number, correct: boolean): AttemptRecord => ({
  questionId: `q-${daysAgo}-${correct}`,
  topic: "Pharmacology",
  examType: "RN",
  sessionId: "s1",
  sessionType: "practice",
  correct,
  answeredAt: new Date(NOW.getTime() - daysAgo * DAY_MS),
  difficulty: null,
  confidence: "high",
  timeSpentMs: 30_000,
});

const setup = (attempts: readonly AttemptRecord[]) => {
  const load = vi.fn(async (_userId: string, _options?: { since?: Date }) => [...attempts]);
  const service = new AnalyticsService({
    history: { load },
    mastery: new MasteryService(),
    confidence: new ConfidenceAnalyticsService(),
    time: new TimeAnalyticsService(),
    clock: () => NOW,
  });
  return { service, load };
};

describe("AnalyticsService", () => {
  it("reports topic mastery for the requested student only", async () => {
    const { service, load } = setup([attempt(1, true), attempt(2, false)]);
    const report = await service.mastery("user-1");
    expect(load).toHaveBeenCalledWith("user-1");
    expect(report.topics.map((t) => t.topic)).toEqual(["Pharmacology"]);
  });

  it("restricts confidence analytics to the requested period", async () => {
    const { service } = setup([attempt(2, true), attempt(40, false)]);
    const report = await service.confidence("user-1", { periodDays: 7 });
    expect(report.overall.rated).toBe(1);
    expect(report.period.since).toBe(new Date(NOW.getTime() - 7 * DAY_MS).toISOString());
  });

  it("covers the whole history when no period is given", async () => {
    const { service } = setup([attempt(2, true), attempt(400, false)]);
    expect((await service.confidence("user-1", {})).overall.rated).toBe(2);
    expect((await service.time("user-1", {})).period.since).toBeNull();
  });

  it("restricts time analytics to the requested period", async () => {
    const { service } = setup([attempt(2, true), attempt(40, false)]);
    const report = await service.time("user-1", { periodDays: 7 });
    expect(report.overall?.count).toBe(1);
  });
});
