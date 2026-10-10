import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "../testing/fake-supabase";
import { SupabaseMistakeRepository } from "./mistake.repository.server";

const USER = "user-1";
const base = { limit: 21, offset: 0 };
const chain = (fake: ReturnType<typeof createFakeSupabase>) =>
  fake.recorded[0].chain.map((c) => [c.method, ...c.args]);

describe("SupabaseMistakeRepository.list", () => {
  it("scopes to the student and requires at least one miss", async () => {
    const fake = createFakeSupabase([{ data: [] }]);
    await new SupabaseMistakeRepository(fake.client).list(USER, {
      ...base,
      spec: { sort: "recent", minMisses: 1, unresolvedOnly: false, since: null },
    });
    expect(chain(fake)).toEqual(
      expect.arrayContaining([
        ["eq", "user_id", USER],
        ["gte", "misses", 1],
        ["order", "last_missed_at", { ascending: false }],
        ["range", 0, 20],
      ]),
    );
  });

  it("applies the repeatedly-failed view, topic and exam type filters", async () => {
    const fake = createFakeSupabase([{ data: [] }]);
    await new SupabaseMistakeRepository(fake.client).list(USER, {
      ...base,
      offset: 40,
      examType: "RM",
      topic: "Anatomy",
      spec: {
        sort: "most_missed",
        minMisses: 2,
        unresolvedOnly: true,
        since: "2026-09-29T00:00:00.000Z",
      },
    });
    expect(chain(fake)).toEqual(
      expect.arrayContaining([
        ["gte", "misses", 2],
        ["eq", "unresolved", true],
        ["gte", "last_missed_at", "2026-09-29T00:00:00.000Z"],
        ["eq", "questions.exam_type", "RM"],
        ["eq", "questions.topic", "Anatomy"],
        ["order", "misses", { ascending: false }],
        ["range", 40, 60],
      ]),
    );
  });

  it("maps rows and only reads the running exam of this student for withheld keys", async () => {
    const question = {
      id: "q1",
      exam_type: "RN",
      topic: "t",
      question_text: "q",
      option_a: "a",
      option_b: "b",
      option_c: "c",
      option_d: "d",
      correct_answer: "A",
      rationale: null,
    };
    const fake = createFakeSupabase([
      {
        data: [
          {
            question_id: "q1",
            misses: 3,
            attempts: 4,
            correct: 1,
            last_missed_at: "2026-10-01T00:00:00Z",
            last_answer: "B",
            unresolved: true,
            questions: question,
          },
        ],
      },
      { data: [{ question_id: "q9" }] },
    ]);
    const repository = new SupabaseMistakeRepository(fake.client);
    await expect(
      repository.list(USER, {
        ...base,
        spec: { sort: "recent", minMisses: 1, unresolvedOnly: false, since: null },
      }),
    ).resolves.toEqual([
      {
        questionId: "q1",
        misses: 3,
        attempts: 4,
        correct: 1,
        lastMissedAt: "2026-10-01T00:00:00Z",
        lastAnswer: "B",
        unresolved: true,
        question,
      },
    ]);
    await expect(repository.activeSessionQuestionIds(USER)).resolves.toEqual(["q9"]);
    const second = fake.recorded[1].chain.map((c) => [c.method, ...c.args]);
    expect(second).toEqual(
      expect.arrayContaining([
        ["eq", "exams.user_id", USER],
        ["eq", "exams.status", "in_progress"],
      ]),
    );
  });
});
