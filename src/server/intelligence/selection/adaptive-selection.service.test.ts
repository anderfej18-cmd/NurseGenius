import { describe, expect, it, vi } from "vitest";
import type { AttemptRecord } from "../attempt.types";
import { MasteryService } from "../mastery/mastery.service";
import { AdaptiveSelectionService } from "./adaptive-selection.service";
import type { CandidateQuestion, QuestionProgress } from "./adaptive-selector";

const NOW = new Date("2026-10-10T09:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const USER = "user-1";

let counter = 0;
const candidate = (topic: string): CandidateQuestion => {
  counter += 1;
  return { id: `c${String(counter).padStart(3, "0")}`, topic, difficulty: null };
};
const pool = (topic: string, count: number) =>
  Array.from({ length: count }, () => candidate(topic));

const attempt = (topic: string, correct: boolean, index: number): AttemptRecord => ({
  questionId: `h-${topic}-${index}`,
  topic,
  examType: "RN",
  sessionId: `s-${topic}-${Math.floor(index / 5)}`,
  sessionType: "mixed",
  correct,
  answeredAt: new Date(NOW.getTime() - DAY_MS),
  difficulty: null,
  confidence: null,
  timeSpentMs: null,
});
const history = (topic: string, count: number, correct: boolean) =>
  Array.from({ length: count }, (_, i) => attempt(topic, correct, i));

function setup(
  attempts: AttemptRecord[] = [],
  progress: Array<[string, QuestionProgress]> = [],
  clock: () => Date = () => NOW,
) {
  const calls: string[] = [];
  const deps = {
    history: {
      load: vi.fn().mockImplementation(async () => {
        calls.push("history");
        return attempts;
      }),
    },
    progress: {
      listProgress: vi.fn().mockImplementation(async () => {
        calls.push("progress");
        return new Map(progress);
      }),
    },
    reviews: {
      refreshStale: vi.fn().mockImplementation(async () => {
        calls.push("refresh");
        return 0;
      }),
    },
    mastery: new MasteryService(),
    clock,
  };
  return { service: new AdaptiveSelectionService(deps), deps, calls };
}

describe("AdaptiveSelectionService.pick", () => {
  it("favours the topics the student's own history shows to be weak", async () => {
    const attempts = [
      ...history("Organic Chemistry", 40, false),
      ...history("Atomic Structure", 40, true),
    ];
    const { service } = setup(attempts);
    const candidates = [...pool("Atomic Structure", 20), ...pool("Organic Chemistry", 20)];

    const picked = await service.pick(USER, candidates, 10);
    const organic = picked.filter((q) => q.topic === "Organic Chemistry").length;
    expect(picked).toHaveLength(10);
    expect(organic).toBeGreaterThan(picked.length - organic);
  });

  it("brings review schedules up to date before reading them", async () => {
    const { service, calls } = setup();
    await service.pick(USER, pool("Anatomy", 5), 3);
    expect(calls[0]).toBe("refresh");
    expect(calls.slice(1).sort()).toEqual(["history", "progress"]);
  });

  it("puts a question that is due for review ahead of an equal one", async () => {
    const [due, other] = pool("Anatomy", 2);
    const { service } = setup(
      [],
      [
        [
          due.id,
          {
            attempts: 2,
            misses: 0,
            unresolved: false,
            nextReviewAt: new Date(NOW.getTime() - 5 * DAY_MS),
          },
        ],
      ],
    );
    const picked = await service.pick(USER, [other, due], 1);
    expect(picked.map((q) => q.id)).toEqual([due.id]);
  });

  it("serves a student with no history, returning as many questions as asked", async () => {
    const { service } = setup();
    expect(await service.pick(USER, pool("Anatomy", 30), 12)).toHaveLength(12);
  });

  it("returns the same questions for the same student and moment, and others at another moment", async () => {
    const candidates = pool("Anatomy", 40);
    const first = await setup().service.pick(USER, candidates, 10);
    expect((await setup().service.pick(USER, candidates, 10)).map((q) => q.id)).toEqual(
      first.map((q) => q.id),
    );

    const later = setup([], [], () => new Date(NOW.getTime() + 1000));
    expect((await later.service.pick(USER, candidates, 10)).map((q) => q.id)).not.toEqual(
      first.map((q) => q.id),
    );
  });

  it("returns the caller's own question objects, not copies", async () => {
    const candidates = pool("Anatomy", 3);
    const picked = await setup().service.pick(USER, candidates, 3);
    expect(picked.every((q) => candidates.includes(q))).toBe(true);
  });

  it("returns nothing for an empty pool and does not read history for it", async () => {
    const { service, deps } = setup();
    expect(await service.pick(USER, [], 10)).toEqual([]);
    expect(deps.history.load).not.toHaveBeenCalled();
  });

  it("returns every question when the pool is smaller than the request", async () => {
    const { service } = setup();
    expect(await service.pick(USER, pool("Anatomy", 4), 10)).toHaveLength(4);
  });

  it("reads only the named student's data", async () => {
    const { service, deps } = setup();
    await service.pick("student-42", pool("Anatomy", 2), 1);
    expect(deps.reviews.refreshStale).toHaveBeenCalledWith("student-42");
    expect(deps.history.load).toHaveBeenCalledWith("student-42");
    expect(deps.progress.listProgress).toHaveBeenCalledWith("student-42");
  });
});

describe("AdaptiveSelectionService.pickWithReasons", () => {
  it("returns the same questions as pick, each with the reason it was chosen", async () => {
    const candidates = pool("Anatomy", 12);
    const withReasons = await setup().service.pickWithReasons(USER, candidates, 5);
    const plain = await setup().service.pick(USER, candidates, 5);
    expect(withReasons.map((entry) => entry.question.id)).toEqual(plain.map((q) => q.id));
    for (const entry of withReasons) expect(typeof entry.reason).toBe("string");
  });

  it("returns nothing for an empty pool or a count of zero", async () => {
    expect(await setup().service.pickWithReasons(USER, [], 5)).toEqual([]);
    expect(await setup().service.pickWithReasons(USER, pool("Anatomy", 3), 0)).toEqual([]);
  });
});
