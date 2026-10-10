import { describe, expect, it } from "vitest";
import { ConflictError, NotFoundError } from "../errors";
import { createFakeSupabase } from "../testing/fake-supabase";
import { SupabaseSessionRepository } from "./session.repository.server";

const USER = "user-1";
const EXAM = "exam-1";

const eqs = (fake: ReturnType<typeof createFakeSupabase>, target: string) =>
  fake.callsOn(target, "eq").map((call) => call.args);

describe("SupabaseSessionRepository ownership filters", () => {
  it("scopes getSession to the owner", async () => {
    const fake = createFakeSupabase([{ data: null }]);
    await expect(
      new SupabaseSessionRepository(fake.client).getSession(USER, EXAM),
    ).resolves.toBeNull();
    expect(eqs(fake, "from:exams")).toEqual(
      expect.arrayContaining([
        ["id", EXAM],
        ["user_id", USER],
      ]),
    );
  });

  it("scopes listItems to the owner through the exam", async () => {
    const fake = createFakeSupabase([{ data: [] }]);
    await new SupabaseSessionRepository(fake.client).listItems(USER, EXAM);
    expect(eqs(fake, "from:exam_answers")).toEqual(
      expect.arrayContaining([
        ["exam_id", EXAM],
        ["exams.user_id", USER],
      ]),
    );
  });

  it("passes the authenticated user, never a client-supplied one, to the save and submit functions", async () => {
    const fake = createFakeSupabase([{ data: "ok" }, { data: "closed" }]);
    const repository = new SupabaseSessionRepository(fake.client);
    await expect(
      repository.saveAnswer(USER, { examId: EXAM, questionId: "q1", answer: "B" }, 10),
    ).resolves.toBe("ok");
    await expect(
      repository.saveAnswer(USER, { examId: EXAM, questionId: "q1", flagged: true }, 10),
    ).resolves.toBe("closed");
    const sent = fake.callsOn("rpc:save_exam_answer", "args").map((call) => call.args[0]);
    expect(sent[0]).toMatchObject({
      _user_id: USER,
      _exam_id: EXAM,
      _question_id: "q1",
      _answer: "B",
      _grace_seconds: 10,
    });
    expect(sent[1]).toMatchObject({ _user_id: USER, _flagged: true });
  });

  it("reports a hint as an event, naming no total", async () => {
    const fake = createFakeSupabase([{ data: "ok" }]);
    await new SupabaseSessionRepository(fake.client).saveAnswer(
      USER,
      { examId: EXAM, questionId: "q1", hintUsed: true },
      10,
    );
    const [sent] = fake.callsOn("rpc:save_exam_answer", "args").map((call) => call.args[0]);
    expect(sent).toMatchObject({ _hint_used: true });
    expect(Object.keys(sent as object).join()).not.toMatch(/hints_used/);
  });

  it("rejects an unexpected result from the save function", async () => {
    const fake = createFakeSupabase([{ data: "weird" }]);
    await expect(
      new SupabaseSessionRepository(fake.client).saveAnswer(
        USER,
        { examId: EXAM, questionId: "q", answer: "A" },
        10,
      ),
    ).rejects.toThrow(/Unexpected/);
  });
});

describe("SupabaseSessionRepository.listFocusQuestionIds", () => {
  const NOW = new Date("2026-10-06T10:00:00.000Z");
  const rows = [{ question_id: "q1" }, { question_id: "q2" }];

  it("lists the student's unresolved mistakes of one exam type, active questions only, newest miss first, bounded", async () => {
    const fake = createFakeSupabase([{ data: rows }]);
    const ids = await new SupabaseSessionRepository(fake.client).listFocusQuestionIds(
      USER,
      "RN",
      "mistakes",
      NOW,
      250,
    );
    expect(ids).toEqual(["q1", "q2"]);
    const eq = fake.callsOn("from:user_question_stats", "eq").map((call) => call.args);
    expect(eq).toEqual(
      expect.arrayContaining([
        ["user_id", USER],
        ["questions.exam_type", "RN"],
        ["questions.status", "active"],
        ["unresolved", true],
      ]),
    );
    expect(fake.callsOn("from:user_question_stats", "order").map((call) => call.args[0])).toContain(
      "last_missed_at",
    );
    expect(fake.callsOn("from:user_question_stats", "limit")[0].args).toEqual([250]);
  });

  it("lists what is due now, oldest due date first, for the same student only", async () => {
    const fake = createFakeSupabase([{ data: rows }]);
    await new SupabaseSessionRepository(fake.client).listFocusQuestionIds(
      USER,
      "RM",
      "due",
      NOW,
      100,
    );
    expect(fake.callsOn("from:user_question_stats", "lte")[0].args).toEqual([
      "next_review_at",
      NOW.toISOString(),
    ]);
    expect(fake.callsOn("from:user_question_stats", "eq").map((call) => call.args)).toContainEqual([
      "user_id",
      USER,
    ]);
    expect(fake.callsOn("from:user_question_stats", "order").map((call) => call.args[0])).toContain(
      "next_review_at",
    );
  });

  it("surfaces a database error", async () => {
    const fake = createFakeSupabase([{ error: { message: "boom" } }]);
    await expect(
      new SupabaseSessionRepository(fake.client).listFocusQuestionIds(USER, "RN", "due", NOW, 10),
    ).rejects.toMatchObject({ message: "boom" });
  });
});

describe("SupabaseSessionRepository error mapping", () => {
  const start = {
    userId: USER,
    examType: "RN" as const,
    category: "All Areas",
    sessionType: "mixed" as const,
    minutes: 30,
    topics: [],
    questionIds: ["q1"],
    today: "2026-10-06",
  };

  it("turns an existing active session into a conflict, from the function or the unique index", async () => {
    for (const error of [
      { message: "active_session_exists" },
      { message: "duplicate key", code: "23505" },
    ]) {
      const fake = createFakeSupabase([{ error }]);
      await expect(
        new SupabaseSessionRepository(fake.client).startSession(start),
      ).rejects.toBeInstanceOf(ConflictError);
    }
  });

  it("turns a submit for someone else's exam into not found", async () => {
    const fake = createFakeSupabase([{ error: { message: "exam_not_found" } }]);
    await expect(
      new SupabaseSessionRepository(fake.client).submit("intruder", EXAM),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("leaves unknown database errors untouched so they are logged and masked upstream", async () => {
    const error = { message: 'relation "exams" is broken' };
    const fake = createFakeSupabase([{ error }]);
    await expect(new SupabaseSessionRepository(fake.client).startSession(start)).rejects.toBe(
      error,
    );
  });

  it("rejects a malformed submit result instead of guessing", async () => {
    const fake = createFakeSupabase([{ data: { exam_id: EXAM, correct_count: "many" } }]);
    await expect(new SupabaseSessionRepository(fake.client).submit(USER, EXAM)).rejects.toThrow();
  });

  it("maps the submit result to camelCase", async () => {
    const fake = createFakeSupabase([
      {
        data: {
          exam_id: EXAM,
          already_completed: true,
          correct_count: 3,
          total_questions: 4,
          score_pct: "75.00",
          auto_submitted: false,
        },
      },
    ]);
    await expect(new SupabaseSessionRepository(fake.client).submit(USER, EXAM)).resolves.toEqual({
      examId: EXAM,
      alreadyCompleted: true,
      correctCount: 3,
      totalQuestions: 4,
      scorePct: 75,
      autoSubmitted: false,
    });
  });
});

describe("SupabaseSessionRepository.listQuestionPool", () => {
  const row = (id: string) => ({
    id,
    topic: "t",
    difficulty: null,
    question_text: "q",
    option_a: "a",
    option_b: "b",
    option_c: "c",
    option_d: "d",
    correct_answer: "A",
  });

  it("pages through the bank with a keyset cursor and only reads active questions", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, i) =>
      row(`id-${String(i).padStart(4, "0")}`),
    );
    const fake = createFakeSupabase([{ data: firstPage }, { data: [row("id-last")] }]);
    const pool = await new SupabaseSessionRepository(fake.client).listQuestionPool(
      "RN",
      "Pharmacology",
    );
    expect(pool).toHaveLength(1001);
    expect(fake.callsOn("from:questions", "gt")).toEqual([
      { method: "gt", args: ["id", "id-0999"] },
    ]);
    expect(eqs(fake, "from:questions")).toEqual(
      expect.arrayContaining([
        ["exam_type", "RN"],
        ["status", "active"],
        ["topic", "Pharmacology"],
      ]),
    );
  });

  it("does not filter by topic when asked for every area", async () => {
    const fake = createFakeSupabase([{ data: [] }]);
    await new SupabaseSessionRepository(fake.client).listQuestionPool("RM", null);
    expect(eqs(fake, "from:questions").some(([column]) => column === "topic")).toBe(false);
  });
});

describe("SupabaseSessionRepository.listCompleted", () => {
  it("reads only the owner's finished tests, newest first, up to the limit", async () => {
    const fake = createFakeSupabase([
      {
        data: [
          {
            id: "e1",
            exam_type: "RN",
            category: "All Areas",
            session_type: "mixed",
            completed_at: "2026-10-01T10:00:00.000Z",
            total_questions: 10,
            correct_count: 7,
            score_pct: 70,
            score_verified: true,
            auto_submitted: false,
          },
        ],
      },
    ]);
    const rows = await new SupabaseSessionRepository(fake.client).listCompleted(USER, 10);
    expect(eqs(fake, "from:exams")).toEqual(
      expect.arrayContaining([
        ["user_id", USER],
        ["status", "completed"],
      ]),
    );
    expect(fake.callsOn("from:exams", "order").map((call) => call.args)).toEqual([
      ["completed_at", { ascending: false }],
    ]);
    expect(fake.callsOn("from:exams", "limit").map((call) => call.args)).toEqual([[10]]);
    expect(rows).toEqual([
      {
        id: "e1",
        examType: "RN",
        category: "All Areas",
        sessionType: "mixed",
        completedAt: "2026-10-01T10:00:00.000Z",
        totalQuestions: 10,
        correctCount: 7,
        scorePct: 70,
        scoreVerified: true,
        autoSubmitted: false,
      },
    ]);
  });

  it("skips a finished test that has no completion time", async () => {
    const fake = createFakeSupabase([
      {
        data: [
          {
            id: "e1",
            exam_type: "RN",
            category: "x",
            session_type: "mixed",
            completed_at: null,
            total_questions: 1,
            correct_count: null,
            score_pct: null,
            score_verified: false,
            auto_submitted: false,
          },
        ],
      },
    ]);
    await expect(
      new SupabaseSessionRepository(fake.client).listCompleted(USER, 5),
    ).resolves.toEqual([]);
  });
});
