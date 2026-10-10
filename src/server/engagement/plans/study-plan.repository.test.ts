import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "../../testing/fake-supabase";
import type { StudyPlanDraft } from "./study-plan";
import { SupabaseStudyPlanStore } from "./study-plan.repository.server";
import type { StoredStudyPlan } from "./study-plan.service";

const USER = "user-1";

const draft: StudyPlanDraft = {
  startsOn: "2026-10-01",
  examDate: "2026-10-15",
  questionsPerDay: 30,
  weeks: [
    {
      index: 0,
      startsOn: "2026-10-01",
      endsOn: "2026-10-07",
      kind: "learn",
      questionBudget: 150,
      items: [
        { weekIndex: 0, kind: "topic", topic: "Pharmacology", questions: 150, mastery: null },
      ],
    },
    {
      index: 1,
      startsOn: "2026-10-08",
      endsOn: "2026-10-14",
      kind: "final",
      questionBudget: 150,
      items: [
        { weekIndex: 1, kind: "review", topic: "Pharmacology", questions: 90, mastery: null },
        { weekIndex: 1, kind: "mock_exam", topic: null, questions: 50, mastery: null },
      ],
    },
  ],
  summary: {
    totalQuestions: 290,
    learnQuestions: 150,
    unallocatedQuestions: 0,
    unscheduledTopics: [],
  },
};
const stored: StoredStudyPlan = {
  examType: "RN",
  settings: { dailyMinutes: 30, daysPerWeek: 5, targetScore: 80 },
  draft,
  createdAt: new Date("2026-10-01T10:00:00.000Z"),
};
const row = {
  exam_type: "RN",
  exam_date: "2026-10-15",
  starts_on: "2026-10-01",
  daily_minutes: 30,
  days_per_week: 5,
  target_score: 80,
  questions_per_day: 30,
  plan: { weeks: draft.weeks, summary: draft.summary },
  created_at: "2026-10-01T10:00:00.000Z",
};

describe("SupabaseStudyPlanStore.getPlan", () => {
  it("reads only this student's plan, with an explicit column list, and maps it", async () => {
    const fake = createFakeSupabase([{ data: row }]);
    const plan = await new SupabaseStudyPlanStore(fake.client).getPlan(USER);

    expect(String(fake.callsOn("from:study_plans", "select")[0].args[0])).toBe(
      "exam_type, exam_date, starts_on, daily_minutes, days_per_week, target_score, questions_per_day, plan, created_at",
    );
    expect(fake.recorded[0].chain.map((c) => [c.method, ...c.args])).toEqual(
      expect.arrayContaining([["eq", "user_id", USER]]),
    );
    expect(plan).toEqual(stored);
  });

  it("is null when the student has no plan", async () => {
    const fake = createFakeSupabase([{ data: null }]);
    expect(await new SupabaseStudyPlanStore(fake.client).getPlan(USER)).toBeNull();
  });

  it("rejects a stored plan that is not shaped like a plan", async () => {
    const fake = createFakeSupabase([{ data: { ...row, plan: { weeks: [{ index: "zero" }] } } }]);
    await expect(new SupabaseStudyPlanStore(fake.client).getPlan(USER)).rejects.toThrow();
  });

  it("rejects an exam type that is not RN or RM", async () => {
    const fake = createFakeSupabase([{ data: { ...row, exam_type: "XX" } }]);
    await expect(new SupabaseStudyPlanStore(fake.client).getPlan(USER)).rejects.toThrow();
  });

  it("passes a database error on", async () => {
    const fake = createFakeSupabase([{ error: { message: "boom" } }]);
    await expect(new SupabaseStudyPlanStore(fake.client).getPlan(USER)).rejects.toEqual({
      message: "boom",
    });
  });
});

describe("SupabaseStudyPlanStore.savePlan", () => {
  it("replaces the student's plan in one upsert keyed on the student", async () => {
    const fake = createFakeSupabase([{ data: null }]);
    await new SupabaseStudyPlanStore(fake.client).savePlan(USER, stored);

    const [upsert] = fake.callsOn("from:study_plans", "upsert");
    expect(upsert.args).toEqual([
      {
        user_id: USER,
        exam_type: "RN",
        exam_date: "2026-10-15",
        starts_on: "2026-10-01",
        daily_minutes: 30,
        days_per_week: 5,
        target_score: 80,
        questions_per_day: 30,
        plan: { weeks: draft.weeks, summary: draft.summary },
        created_at: "2026-10-01T10:00:00.000Z",
      },
      { onConflict: "user_id" },
    ]);
  });

  it("passes a database error on", async () => {
    const fake = createFakeSupabase([{ error: { message: "boom" } }]);
    await expect(new SupabaseStudyPlanStore(fake.client).savePlan(USER, stored)).rejects.toEqual({
      message: "boom",
    });
  });

  it("reads a plan stored before items recorded mastery, as not recorded", async () => {
    const oldItem = { weekIndex: 0, kind: "topic", topic: "Pharmacology", questions: 150 };
    const document = {
      weeks: [{ ...draft.weeks[0], items: [oldItem] }],
      summary: draft.summary,
    };
    const fake = createFakeSupabase([
      {
        data: {
          exam_type: "RN",
          exam_date: "2026-10-15",
          starts_on: "2026-10-01",
          daily_minutes: 30,
          days_per_week: 5,
          target_score: 80,
          questions_per_day: 30,
          plan: document,
          created_at: "2026-10-01T10:00:00.000Z",
        },
      },
    ]);
    const plan = await new SupabaseStudyPlanStore(fake.client).getPlan(USER);
    expect(plan?.draft.weeks[0].items[0].mastery).toBeNull();
  });
});

describe("SupabaseStudyPlanStore.setExamDate", () => {
  it("updates only the named student's profile, and only the exam date", async () => {
    const fake = createFakeSupabase([{ data: null }]);
    await new SupabaseStudyPlanStore(fake.client).setExamDate(USER, "2026-12-01");
    expect(fake.callsOn("from:profiles", "update")[0].args).toEqual([{ exam_date: "2026-12-01" }]);
    expect(fake.callsOn("from:profiles", "eq")[0].args).toEqual(["id", USER]);
  });

  it("passes a database error on", async () => {
    const fake = createFakeSupabase([{ error: { message: "boom" } }]);
    await expect(
      new SupabaseStudyPlanStore(fake.client).setExamDate(USER, "2026-12-01"),
    ).rejects.toEqual({ message: "boom" });
  });
});
