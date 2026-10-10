import { describe, expect, it, vi } from "vitest";
import { NotFoundError, ValidationError } from "@/lib/app-errors";
import type { AttemptRecord } from "../attempt.types";
import { MasteryService } from "../mastery/mastery.service";
import { TimeAnalyticsService } from "../time/time-analytics.service";
import {
  type NewReadinessSnapshot,
  ReadinessService,
  type ReadinessProfile,
  type ReadinessSnapshot,
} from "./readiness.service";

const NOW = new Date("2026-10-10T15:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

let sequence = 0;
const attempt = (examType: "RN" | "RM", topic: string, daysAgo = 1): AttemptRecord => {
  sequence += 1;
  return {
    questionId: `q-${sequence}`,
    topic,
    examType,
    sessionId: `s-${daysAgo}`,
    sessionType: "practice",
    correct: true,
    answeredAt: new Date(NOW.getTime() - daysAgo * DAY_MS),
    difficulty: null,
    confidence: null,
    timeSpentMs: 60_000,
  };
};

const setup = (
  options: {
    attempts?: readonly AttemptRecord[];
    profile?: ReadinessProfile | null;
    counts?: Record<string, number>;
    snapshots?: ReadinessSnapshot[] | "fail";
  } = {},
) => {
  const attempts = options.attempts ?? [];
  const history = { load: vi.fn(async (_userId: string) => [...attempts]) };
  const profile =
    options.profile === undefined ? { examDate: null, examPreference: "RN" } : options.profile;
  const store = { getReadinessProfile: vi.fn(async (_userId: string) => profile) };
  const catalog = {
    topicCounts: vi.fn(async (_examType: "RN" | "RM") => options.counts ?? { A: 10, B: 10 }),
  };
  const record = vi.fn(async (_userId: string, _snapshot: NewReadinessSnapshot) => {
    if (options.snapshots === "fail") throw new Error("db down");
    return options.snapshots ?? [];
  });
  const service = new ReadinessService({
    history,
    mastery: new MasteryService(),
    time: new TimeAnalyticsService(),
    store: { ...store, recordSnapshot: record },
    catalog,
    clock: () => NOW,
  });
  return { service, history, store, catalog, record };
};

describe("ReadinessService.assess", () => {
  it("assesses the exam type the student asks for, ignoring attempts at the other", async () => {
    const attempts = [
      ...Array.from({ length: 6 }, () => attempt("RN", "A")),
      ...Array.from({ length: 40 }, () => attempt("RM", "M")),
    ];
    const { service, catalog } = setup({ attempts });

    const report = await service.assess("user-1", { examType: "RN" });

    expect(report.examType).toBe("RN");
    expect(report.attempts).toBe(6);
    expect(catalog.topicCounts).toHaveBeenCalledWith("RN");
  });

  it("falls back to the exam type in the student's profile", async () => {
    const attempts = Array.from({ length: 5 }, () => attempt("RM", "M"));
    const { service, catalog } = setup({
      attempts,
      profile: { examDate: null, examPreference: "RM" },
    });
    const report = await service.assess("user-1", {});
    expect(report.examType).toBe("RM");
    expect(report.attempts).toBe(5);
    expect(catalog.topicCounts).toHaveBeenCalledWith("RM");
  });

  it.each([["Both"], [null]])(
    "asks the student to choose when the profile preference is %s",
    async (examPreference) => {
      const { service, history } = setup({ profile: { examDate: null, examPreference } });
      await expect(service.assess("user-1", {})).rejects.toBeInstanceOf(ValidationError);
      expect(history.load).not.toHaveBeenCalled();
    },
  );

  it("uses the requested exam type even when the profile says Both", async () => {
    const { service } = setup({ profile: { examDate: null, examPreference: "Both" } });
    expect((await service.assess("user-1", { examType: "RM" })).examType).toBe("RM");
  });

  it("reports a missing profile as not found", async () => {
    const { service } = setup({ profile: null });
    await expect(service.assess("user-1", { examType: "RN" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("measures coverage against the topics in the bank and the exam against today", async () => {
    const attempts = Array.from({ length: 5 }, () => attempt("RN", "A"));
    const { service } = setup({
      attempts,
      profile: { examDate: "2026-10-20", examPreference: "RN" },
      counts: { A: 3, B: 3 },
    });
    const report = await service.assess("user-1", {});
    // topic A has 5 attempts: 1 of the 2 topics in the bank
    expect(report.components.coverage.value).toBe(0.5);
    expect(report.exam).toEqual({ date: "2026-10-20", daysToExam: 10, urgency: "high" });
  });

  it("reads only the signed-in student's history", async () => {
    const { service, history, store } = setup();
    await service.assess("user-9", { examType: "RN" });
    expect(history.load).toHaveBeenCalledWith("user-9");
    expect(store.getReadinessProfile).toHaveBeenCalledWith("user-9");
  });
});

describe("ReadinessService.assess: history of assessments", () => {
  const scored = Array.from({ length: 60 }, (_, i) =>
    attempt("RN", i % 2 === 0 ? "A" : "B", 1 + (i % 10)),
  );

  it("records each assessment and reports when it was made and how it moved since the last one", async () => {
    const { service, record } = setup({
      attempts: scored,
      snapshots: [
        { assessedAt: "2026-10-10T15:00:00.000Z", score: 61.4, attempts: 60 },
        { assessedAt: "2026-10-03T09:00:00.000Z", score: 55.9, attempts: 40 },
      ],
    });
    const report = await service.assess("user-1", { examType: "RN" });

    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][0]).toBe("user-1");
    expect(record.mock.calls[0][1]).toMatchObject({
      examType: "RN",
      attempts: 60,
      band: report.band,
      score: report.readinessScore,
    });
    expect(report.history).toEqual({
      assessedAt: "2026-10-10T15:00:00.000Z",
      previous: { assessedAt: "2026-10-03T09:00:00.000Z", score: 55.9 },
      change: 5.5,
    });
  });

  it("reports no change on a first assessment, or when the earlier one had no score", async () => {
    const first = await setup({
      attempts: scored,
      snapshots: [{ assessedAt: "2026-10-10T15:00:00.000Z", score: 61.4, attempts: 60 }],
    }).service.assess("user-1", { examType: "RN" });
    expect(first.history).toEqual({
      assessedAt: "2026-10-10T15:00:00.000Z",
      previous: null,
      change: null,
    });

    const unscored = await setup({
      attempts: scored,
      snapshots: [
        { assessedAt: "2026-10-10T15:00:00.000Z", score: 61.4, attempts: 60 },
        { assessedAt: "2026-10-01T15:00:00.000Z", score: null, attempts: 5 },
      ],
    }).service.assess("user-1", { examType: "RN" });
    expect(unscored.history?.previous).toEqual({
      assessedAt: "2026-10-01T15:00:00.000Z",
      score: null,
    });
    expect(unscored.history?.change).toBeNull();
  });

  it("still gives the measured report when recording the history fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { service } = setup({ attempts: scored, snapshots: "fail" });
    const report = await service.assess("user-1", { examType: "RN" });
    expect(report.attempts).toBe(60);
    expect(report.history).toBeNull();
  });

  it("records only the student's own assessment", async () => {
    const { service, record } = setup({ attempts: scored });
    await service.assess("user-9", { examType: "RN" });
    expect(record.mock.calls.every(([userId]) => userId === "user-9")).toBe(true);
  });
});
