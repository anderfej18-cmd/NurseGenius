import { describe, expect, it } from "vitest";
import type { PlanWeek } from "./study-plan";
import { type ProgressAttempt, planProgress } from "./study-plan-progress";

const plan: { weeks: readonly PlanWeek[] } = {
  weeks: [
    {
      index: 0,
      startsOn: "2026-10-01",
      endsOn: "2026-10-07",
      kind: "learn",
      questionBudget: 100,
      items: [
        { weekIndex: 0, kind: "topic", topic: "A", questions: 50, mastery: null },
        { weekIndex: 0, kind: "topic", topic: "B", questions: 40, mastery: null },
      ],
    },
    {
      index: 1,
      startsOn: "2026-10-08",
      endsOn: "2026-10-14",
      kind: "final",
      questionBudget: 60,
      items: [
        { weekIndex: 1, kind: "review", topic: "A", questions: 30, mastery: null },
        { weekIndex: 1, kind: "mock_exam", topic: null, questions: 20, mastery: null },
      ],
    },
  ],
};

const answered = (
  topic: string,
  count: number,
  at: string,
  sessionType = "mixed",
): ProgressAttempt[] =>
  Array.from({ length: count }, () => ({ topic, answeredAt: new Date(at), sessionType }));
const progress = (attempts: ProgressAttempt[], today: string) =>
  planProgress(plan, attempts, today);

describe("planProgress: what is done", () => {
  it("counts answers by topic within each week, up to what the item asks", () => {
    const report = progress(
      [...answered("A", 30, "2026-10-02T10:00:00Z"), ...answered("B", 50, "2026-10-03T10:00:00Z")],
      "2026-10-03",
    );
    expect(report.weeks[0].items.map((i) => [i.topic, i.done])).toEqual([
      ["A", 30],
      ["B", 40], // 50 answered, but the plan asked for 40
    ]);
    expect(report.weeks[0]).toMatchObject({ planned: 90, done: 70 });
    expect(report.questionsDone).toBe(70);
  });

  it("assigns a day to the week it falls in, by UTC date", () => {
    const report = progress(
      [...answered("A", 5, "2026-10-07T23:59:59Z"), ...answered("A", 7, "2026-10-08T00:00:00Z")],
      "2026-10-09",
    );
    expect(report.weeks[0].items[0].done).toBe(5);
    expect(report.weeks[1].items[0].done).toBe(7); // review of A
  });

  it("ignores answers before the plan began and after it ended", () => {
    const report = progress(
      [...answered("A", 9, "2026-09-30T23:00:00Z"), ...answered("A", 9, "2026-10-15T00:00:00Z")],
      "2026-10-15",
    );
    expect(report.questionsDone).toBe(0);
  });

  it("ignores topics the plan does not ask for", () => {
    expect(progress(answered("C", 20, "2026-10-02T10:00:00Z"), "2026-10-03").questionsDone).toBe(0);
  });

  it("counts mock-exam sessions toward the mock exam only, not toward the review", () => {
    const report = progress(answered("A", 15, "2026-10-09T10:00:00Z", "mock_exam"), "2026-10-09");
    const final = report.weeks[1].items;
    expect(final.find((i) => i.kind === "mock_exam")?.done).toBe(15);
    expect(final.find((i) => i.kind === "review")?.done).toBe(0);
  });

  it("counts timed exams as mock exams too, and stops at the planned size", () => {
    const report = progress(answered("B", 40, "2026-10-09T10:00:00Z", "timed_exam"), "2026-10-09");
    expect(report.weeks[1].items.find((i) => i.kind === "mock_exam")?.done).toBe(20);
  });

  it("is all zero for a student who has not practised", () => {
    const report = progress([], "2026-10-03");
    expect(report.questionsDone).toBe(0);
    expect(report.weeks.map((w) => w.done)).toEqual([0, 0]);
  });
});

describe("planProgress: how far along the plan should be", () => {
  it("expects part of the current week, in proportion to the days that have passed", () => {
    // Today is the 3rd day of a 7-day week of 90: round(90 × 3 / 7) = round(38.57) = 39.
    const report = progress([], "2026-10-03");
    expect(report).toMatchObject({ currentWeek: 0, plannedToDate: 39 });
  });

  it("expects all of every finished week, and part of the current one", () => {
    // Week 0 is over (90); 2 of 7 days of week 1 (50): round(50 × 2 / 7) = 14.
    expect(progress([], "2026-10-09")).toMatchObject({ currentWeek: 1, plannedToDate: 90 + 14 });
  });

  it("expects nothing before the plan begins", () => {
    expect(progress([], "2026-09-30")).toMatchObject({
      currentWeek: null,
      plannedToDate: 0,
      status: "not_started",
    });
  });

  it("is finished once the last week is over", () => {
    expect(progress(answered("A", 30, "2026-10-02T10:00:00Z"), "2026-10-15")).toMatchObject({
      currentWeek: null,
      plannedToDate: 140,
      status: "finished",
    });
  });
});

describe("planProgress: the status", () => {
  it("is behind below 70% of what was due", () => {
    // Due 104 on 10-09, done 70: 0.67.
    const report = progress(
      [...answered("A", 30, "2026-10-02T10:00:00Z"), ...answered("B", 40, "2026-10-03T10:00:00Z")],
      "2026-10-09",
    );
    expect(report.status).toBe("behind");
  });

  it("is on track between 70% and 110%", () => {
    // Due 90 + round(50/7) = 97 on 10-08, done 90: 0.93.
    const report = progress(
      [...answered("A", 50, "2026-10-02T10:00:00Z"), ...answered("B", 40, "2026-10-03T10:00:00Z")],
      "2026-10-08",
    );
    expect(report).toMatchObject({ plannedToDate: 97, questionsDone: 90, status: "on_track" });
  });

  it("is ahead above 110%", () => {
    // Due 39 on 10-03, done 70: 1.79.
    const report = progress(
      [...answered("A", 30, "2026-10-02T10:00:00Z"), ...answered("B", 40, "2026-10-03T10:00:00Z")],
      "2026-10-03",
    );
    expect(report.status).toBe("ahead");
  });

  it("is behind for a student who has done nothing while work was due", () => {
    expect(progress([], "2026-10-03").status).toBe("behind");
  });
});

describe("planProgress: purity", () => {
  it("does not change the plan or the attempts", () => {
    const attempts = Object.freeze(answered("A", 3, "2026-10-02T10:00:00Z"));
    const before = JSON.stringify(plan);
    progress([...attempts], "2026-10-03");
    expect(JSON.stringify(plan)).toBe(before);
  });
});
