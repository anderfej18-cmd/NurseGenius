import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "../../testing/fake-supabase";
import { SupabaseReviewStore } from "./review.repository.server";
import type { SavedReviewState } from "./review.types";

const USER = "user-1";
const NOW = new Date("2026-10-10T09:00:00.000Z");
const chain = (fake: ReturnType<typeof createFakeSupabase>, index = 0) =>
  fake.recorded[index].chain.map((c) => [c.method, ...c.args]);

const state = (questionId: string): SavedReviewState => ({
  questionId,
  nextReviewAt: new Date("2026-10-12T09:00:00.000Z"),
  reviewCount: 3,
  lastReviewedAt: new Date("2026-10-06T09:00:00.000Z"),
  status: "review",
  intervalDays: 6,
  ease: 2.5,
});

describe("SupabaseReviewStore.staleQuestionIds", () => {
  it("reads only this student's stale rows, capped", async () => {
    const fake = createFakeSupabase([{ data: [{ question_id: "q1" }, { question_id: "q2" }] }]);
    await expect(new SupabaseReviewStore(fake.client).staleQuestionIds(USER, 50)).resolves.toEqual([
      "q1",
      "q2",
    ]);
    expect(chain(fake)).toEqual(
      expect.arrayContaining([
        ["eq", "user_id", USER],
        ["eq", "review_stale", true],
        ["limit", 50],
      ]),
    );
  });
});

describe("SupabaseReviewStore.saveStates", () => {
  it("writes snake_case rows through the batch function for the named student", async () => {
    const fake = createFakeSupabase([{ data: 1 }]);
    await new SupabaseReviewStore(fake.client).saveStates(USER, [state("q1")]);
    expect(fake.callsOn("rpc:apply_review_states", "args")[0].args[0]).toEqual({
      _user_id: USER,
      _states: [
        {
          question_id: "q1",
          next_review_at: "2026-10-12T09:00:00.000Z",
          review_count: 3,
          last_reviewed_at: "2026-10-06T09:00:00.000Z",
          review_status: "review",
          interval_days: 6,
          ease: 2.5,
        },
      ],
    });
  });

  it("splits a large batch to stay within the function's limit", async () => {
    const fake = createFakeSupabase([{ data: 1000 }, { data: 5 }]);
    await new SupabaseReviewStore(fake.client).saveStates(
      USER,
      Array.from({ length: 1005 }, (_, i) => state(`q${i}`)),
    );
    const sizes = fake
      .callsOn("rpc:apply_review_states", "args")
      .map((call) => (call.args[0] as { _states: unknown[] })._states.length);
    expect(sizes).toEqual([1000, 5]);
  });

  it("does nothing for no states and rethrows database errors", async () => {
    const quiet = createFakeSupabase([]);
    await new SupabaseReviewStore(quiet.client).saveStates(USER, []);
    expect(quiet.recorded).toHaveLength(0);

    const error = { message: "boom" };
    const failing = createFakeSupabase([{ error }]);
    await expect(
      new SupabaseReviewStore(failing.client).saveStates(USER, [state("q1")]),
    ).rejects.toBe(error);
  });
});

describe("SupabaseReviewStore.listDue", () => {
  const row = {
    question_id: "q1",
    next_review_at: "2026-10-09T09:00:00.000Z",
    review_status: "learning",
    review_count: 1,
    interval_days: 1,
    questions: {
      exam_type: "RN",
      topic: "Anatomy",
      question_text: "Q?",
      option_a: "a",
      option_b: "b",
      option_c: "c",
      option_d: "d",
    },
  };

  it("lists only this student's due questions that are still active, most overdue first, without the answer key", async () => {
    const fake = createFakeSupabase([{ data: [row] }]);
    const [due] = await new SupabaseReviewStore(fake.client).listDue(USER, {
      now: NOW,
      limit: 21,
      offset: 40,
    });

    expect(chain(fake)).toEqual(
      expect.arrayContaining([
        ["eq", "user_id", USER],
        ["lte", "next_review_at", NOW.toISOString()],
        ["eq", "questions.status", "active"],
        ["order", "next_review_at", { ascending: true }],
        ["range", 40, 60],
      ]),
    );
    expect(String(fake.callsOn("from:user_question_stats", "select")[0].args[0])).not.toMatch(
      /correct_answer|rationale|\*/,
    );
    expect(due).toMatchObject({
      questionId: "q1",
      status: "learning",
      nextReviewAt: new Date("2026-10-09T09:00:00.000Z"),
    });
  });

  it("applies the topic and exam-type filters", async () => {
    const fake = createFakeSupabase([{ data: [] }]);
    await new SupabaseReviewStore(fake.client).listDue(USER, {
      now: NOW,
      examType: "RM",
      topic: "Ethics",
      limit: 11,
      offset: 0,
    });
    expect(chain(fake)).toEqual(
      expect.arrayContaining([
        ["eq", "questions.exam_type", "RM"],
        ["eq", "questions.topic", "Ethics"],
      ]),
    );
  });

  it("fails loudly on a status the schema does not allow", async () => {
    const fake = createFakeSupabase([{ data: [{ ...row, review_status: "genius" }] }]);
    await expect(
      new SupabaseReviewStore(fake.client).listDue(USER, { now: NOW, limit: 11, offset: 0 }),
    ).rejects.toThrow();
  });
});

describe("SupabaseReviewStore.countDue", () => {
  it("counts this student's due reviews", async () => {
    const fake = createFakeSupabase([{ data: null }]);
    const store = new SupabaseReviewStore(fake.client);
    await store.countDue(USER, NOW);
    expect(chain(fake)).toEqual(
      expect.arrayContaining([
        ["eq", "user_id", USER],
        ["lte", "next_review_at", NOW.toISOString()],
      ]),
    );
  });
});
