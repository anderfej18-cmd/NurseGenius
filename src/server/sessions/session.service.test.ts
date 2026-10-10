import { describe, expect, it, vi } from "vitest";
import { ALL_AREAS } from "@/lib/exam-rules";
import {
  ConflictError,
  LimitReachedError,
  NotFoundError,
  SessionClosedError,
  ValidationError,
} from "../errors";
import { SessionService, type SessionRepository } from "./session.service";
import type {
  HistoryRow,
  PoolQuestion,
  Quota,
  SessionItemRow,
  SessionRecord,
  SubmitResult,
} from "./session.types";

const NOW = new Date("2026-10-06T10:00:00.000Z");
const USER = "user-1";
const EXAM = "exam-1";

const question = (n: number, overrides: Partial<PoolQuestion> = {}): PoolQuestion => ({
  id: `q${n}`,
  difficulty: null,
  topic: n % 2 === 0 ? "Pharmacology" : "Anatomy",
  question_text: `Which option is right for case ${n}?`,
  option_a: "a",
  option_b: "b",
  option_c: "c",
  option_d: "d",
  correct_answer: "A",
  ...overrides,
});
const pool = (size: number) => Array.from({ length: size }, (_, i) => question(i + 1));

const quota = (overrides: Partial<Quota> = {}): Quota => ({
  tier: "novice",
  expiryDate: null,
  questionsToday: 0,
  lastQuestionDate: null,
  ...overrides,
});

const session = (overrides: Partial<SessionRecord> = {}): SessionRecord => ({
  id: EXAM,
  examType: "RN",
  category: ALL_AREAS,
  sessionType: "mixed",
  status: "in_progress",
  startedAt: "2026-10-06T09:30:00.000Z",
  deadlineAt: "2026-10-06T10:30:00.000Z",
  completedAt: null,
  timeLimitMinutes: 60,
  totalQuestions: 2,
  correctCount: null,
  scorePct: null,
  autoSubmitted: false,
  ...overrides,
});

const itemRow = (n: number, overrides: Partial<SessionItemRow> = {}): SessionItemRow => ({
  answerId: `a${n}`,
  questionId: `q${n}`,
  position: n - 1,
  userAnswer: null,
  isCorrect: null,
  flagged: false,
  confidence: null,
  selectionReason: null,
  question: { ...question(n), rationale: "Secret rationale text" },
  ...overrides,
});

const submitResult = (overrides: Partial<SubmitResult> = {}): SubmitResult => ({
  examId: EXAM,
  alreadyCompleted: false,
  correctCount: 1,
  totalQuestions: 2,
  scorePct: 50,
  autoSubmitted: false,
  ...overrides,
});

function setup(overrides: Partial<SessionRepository> = {}, now = NOW) {
  const repository: SessionRepository = {
    getQuota: vi.fn().mockResolvedValue(quota()),
    listQuestionPool: vi.fn().mockResolvedValue(pool(80)),
    startSession: vi.fn().mockResolvedValue(EXAM),
    getSession: vi.fn().mockResolvedValue(session()),
    listItems: vi.fn().mockResolvedValue([itemRow(1), itemRow(2)]),
    saveAnswer: vi.fn().mockResolvedValue("ok"),
    submit: vi.fn().mockResolvedValue(submitResult()),
    listFocusQuestionIds: vi.fn().mockResolvedValue([]),
    recordSelectionReasons: vi.fn().mockResolvedValue(undefined),
    listCompleted: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
  const similar = {
    find: vi.fn().mockResolvedValue({ source: {}, items: [{ id: "q7" }, { id: "q3" }] }),
  };
  const afterScoring = vi.fn().mockResolvedValue(undefined);
  // Adaptive selection takes the last questions of the pool, so tests can tell it from random sampling.
  const adaptiveSelection = {
    pickWithReasons: vi
      .fn()
      .mockImplementation(
        async (_user: string, candidates: readonly PoolQuestion[], count: number) =>
          candidates.slice(-count).map((picked) => ({ question: picked, reason: "weak_topic" })),
      ),
  };
  const service = new SessionService({
    repository,
    clock: () => now,
    random: () => 0,
    afterScoring,
    adaptiveSelection,
    similar,
  });
  return { service, repository, afterScoring, adaptiveSelection, similar };
}

const input = { examType: "RN" as const, category: ALL_AREAS, count: 10, minutes: 30 };

describe("SessionService.start", () => {
  it("selects questions on the server and starts a mixed session", async () => {
    const { service, repository } = setup();
    const result = await service.start(USER, input);

    expect(result).toEqual({ examId: EXAM, totalQuestions: 10 });
    expect(repository.listQuestionPool).toHaveBeenCalledWith("RN", null);
    const record = vi.mocked(repository.startSession).mock.calls[0][0];
    expect(record).toMatchObject({
      userId: USER,
      examType: "RN",
      category: ALL_AREAS,
      sessionType: "mixed",
      minutes: 30,
      today: "2026-10-06",
    });
    expect(record.questionIds).toHaveLength(10);
    expect(new Set(record.questionIds).size).toBe(10);
  });

  it("snapshots the distinct topics of the questions actually picked", async () => {
    const { service, repository } = setup();
    await service.start(USER, { ...input, count: 10 });
    expect(vi.mocked(repository.startSession).mock.calls[0][0].topics).toEqual([
      "Anatomy",
      "Pharmacology",
    ]);
  });

  it("starts a topic session for a specific category", async () => {
    const topicPool = pool(20).map((q) => ({ ...q, topic: "Pharmacology" }));
    const { service, repository } = setup({
      listQuestionPool: vi.fn().mockResolvedValue(topicPool),
    });
    await service.start(USER, { ...input, category: "Pharmacology" });
    expect(repository.listQuestionPool).toHaveBeenCalledWith("RN", "Pharmacology");
    expect(vi.mocked(repository.startSession).mock.calls[0][0]).toMatchObject({
      sessionType: "topic_practice",
      topics: ["Pharmacology"],
    });
  });

  it("never selects incomplete questions", async () => {
    const broken = [
      question(1, { question_text: "34." }),
      question(2, { option_b: "" }),
      question(3, { correct_answer: "E" }),
      question(4),
      question(5),
    ];
    const { service, repository } = setup({ listQuestionPool: vi.fn().mockResolvedValue(broken) });
    const result = await service.start(USER, { ...input, count: 10 });
    expect(result.totalQuestions).toBe(2);
    expect(vi.mocked(repository.startSession).mock.calls[0][0].questionIds.sort()).toEqual([
      "q4",
      "q5",
    ]);
  });

  it("rejects an empty question pool without creating a session", async () => {
    const { service, repository } = setup({ listQuestionPool: vi.fn().mockResolvedValue([]) });
    await expect(service.start(USER, input)).rejects.toBeInstanceOf(ValidationError);
    expect(repository.startSession).not.toHaveBeenCalled();
  });

  it("rejects a student whose profile does not exist", async () => {
    const { service, repository } = setup({ getQuota: vi.fn().mockResolvedValue(null) });
    await expect(service.start(USER, input)).rejects.toBeInstanceOf(NotFoundError);
    expect(repository.startSession).not.toHaveBeenCalled();
  });

  describe("adaptive selection", () => {
    it("lets the server choose by the student's needs when asked for adaptive selection", async () => {
      const { service, repository, adaptiveSelection } = setup();
      await service.start(USER, { ...input, count: 5, selection: "adaptive" });

      expect(adaptiveSelection.pickWithReasons).toHaveBeenCalledOnce();
      expect(vi.mocked(adaptiveSelection.pickWithReasons).mock.calls[0][0]).toBe(USER);
      expect(vi.mocked(adaptiveSelection.pickWithReasons).mock.calls[0][2]).toBe(5);
      expect(vi.mocked(repository.startSession).mock.calls[0][0].questionIds).toEqual([
        "q76",
        "q77",
        "q78",
        "q79",
        "q80",
      ]);
    });

    it("keeps random selection as the default, without consulting the student's history", async () => {
      const { service, adaptiveSelection } = setup();
      await service.start(USER, input);
      await service.start(USER, { ...input, selection: "random" });
      expect(adaptiveSelection.pickWithReasons).not.toHaveBeenCalled();
    });

    it("only offers complete questions to the selection", async () => {
      const broken = [
        question(1, { question_text: "34." }),
        question(2),
        question(3, { option_d: "" }),
      ];
      const { service, adaptiveSelection } = setup({
        listQuestionPool: vi.fn().mockResolvedValue(broken),
      });
      await service.start(USER, { ...input, count: 5, selection: "adaptive" });
      expect(
        vi
          .mocked(adaptiveSelection.pickWithReasons)
          .mock.calls[0][1].map((q: PoolQuestion) => q.id),
      ).toEqual(["q2"]);
    });

    it("reports a session of the size the selection returned", async () => {
      const { service } = setup({ listQuestionPool: vi.fn().mockResolvedValue(pool(4)) });
      await expect(
        service.start(USER, { ...input, count: 10, selection: "adaptive" }),
      ).resolves.toMatchObject({ totalQuestions: 4 });
    });

    it("stops at the tier limits before reading anything about the student", async () => {
      const { service, adaptiveSelection } = setup();
      await expect(
        service.start(USER, { ...input, count: 60, selection: "adaptive" }),
      ).rejects.toBeInstanceOf(LimitReachedError);
      expect(adaptiveSelection.pickWithReasons).not.toHaveBeenCalled();
    });

    it("rejects an empty pool before selecting", async () => {
      const { service, adaptiveSelection } = setup({
        listQuestionPool: vi.fn().mockResolvedValue([]),
      });
      await expect(service.start(USER, { ...input, selection: "adaptive" })).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(adaptiveSelection.pickWithReasons).not.toHaveBeenCalled();
    });

    it("still records the topics and session type of the questions chosen", async () => {
      const { service, repository } = setup();
      await service.start(USER, { ...input, count: 4, selection: "adaptive" });
      expect(vi.mocked(repository.startSession).mock.calls[0][0]).toMatchObject({
        sessionType: "mixed",
      });
    });
  });

  describe("tier limits", () => {
    it("rejects a session larger than the tier's per-session cap", async () => {
      const { service, repository } = setup();
      await expect(service.start(USER, { ...input, count: 60 })).rejects.toThrow(
        /novice tier allows max 50/,
      );
      expect(repository.startSession).not.toHaveBeenCalled();
    });

    it("allows a larger session on a higher tier", async () => {
      const { service } = setup({
        getQuota: vi
          .fn()
          .mockResolvedValue(quota({ tier: "erudite", expiryDate: "2026-12-01T00:00:00Z" })),
      });
      await expect(service.start(USER, { ...input, count: 100 })).resolves.toMatchObject({
        totalQuestions: 80,
      });
    });

    it("treats an expired subscription as novice", async () => {
      const { service } = setup({
        getQuota: vi
          .fn()
          .mockResolvedValue(quota({ tier: "scholar", expiryDate: "2026-10-01T00:00:00Z" })),
      });
      await expect(service.start(USER, { ...input, count: 100 })).rejects.toBeInstanceOf(
        LimitReachedError,
      );
    });

    it("stops a student who has used the whole daily allowance", async () => {
      const { service, repository } = setup({
        getQuota: vi
          .fn()
          .mockResolvedValue(quota({ questionsToday: 50, lastQuestionDate: "2026-10-06" })),
      });
      await expect(service.start(USER, input)).rejects.toThrow(/hit your daily limit/);
      expect(repository.startSession).not.toHaveBeenCalled();
    });

    it("rejects a request larger than what is left today", async () => {
      const { service } = setup({
        getQuota: vi
          .fn()
          .mockResolvedValue(quota({ questionsToday: 45, lastQuestionDate: "2026-10-06" })),
      });
      await expect(service.start(USER, input)).rejects.toThrow(/Only 5 questions left today/);
    });

    it("lets the same request through on a new day", async () => {
      const { service } = setup({
        getQuota: vi
          .fn()
          .mockResolvedValue(quota({ questionsToday: 50, lastQuestionDate: "2026-10-05" })),
      });
      await expect(service.start(USER, input)).resolves.toMatchObject({ totalQuestions: 10 });
    });

    it("does not cap a scholar's daily total", async () => {
      const { service } = setup({
        getQuota: vi.fn().mockResolvedValue(
          quota({
            tier: "scholar",
            expiryDate: "2026-12-01T00:00:00Z",
            questionsToday: 9999,
            lastQuestionDate: "2026-10-06",
          }),
        ),
      });
      await expect(service.start(USER, input)).resolves.toMatchObject({ totalQuestions: 10 });
    });
  });

  it("surfaces an existing active session as a conflict", async () => {
    const { service } = setup({
      startSession: vi
        .fn()
        .mockRejectedValue(new ConflictError("You already have an exam in progress.")),
    });
    await expect(service.start(USER, input)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("SessionService.get", () => {
  it("returns the session and questions without the answer key or rationale", async () => {
    const { service } = setup();
    const view = await service.get(USER, EXAM);
    expect(view.session).toMatchObject({
      id: EXAM,
      deadlineAt: "2026-10-06T10:30:00.000Z",
      serverNow: NOW.toISOString(),
      status: "in_progress",
    });
    expect(view.items).toHaveLength(2);
    const serialized = JSON.stringify(view);
    expect(serialized).not.toMatch(
      /correct_answer|rationale|Secret rationale|isCorrect|is_correct/,
    );
  });

  it("hides questions that are incomplete", async () => {
    const { service } = setup({
      listItems: vi
        .fn()
        .mockResolvedValue([
          itemRow(1),
          itemRow(2, { question: { ...itemRow(2).question, option_c: "" } }),
        ]),
    });
    expect((await service.get(USER, EXAM)).items.map((i) => i.questionId)).toEqual(["q1"]);
  });

  it("does not reveal another student's or a missing session", async () => {
    const { service, repository } = setup({ getSession: vi.fn().mockResolvedValue(null) });
    await expect(service.get("someone-else", EXAM)).rejects.toBeInstanceOf(NotFoundError);
    expect(repository.getSession).toHaveBeenCalledWith("someone-else", EXAM);
    expect(repository.listItems).not.toHaveBeenCalled();
  });

  it("finalises a session whose deadline has passed and returns it closed", async () => {
    const expired = session({ deadlineAt: "2026-10-06T09:59:00.000Z" });
    const { service, repository } = setup({ getSession: vi.fn().mockResolvedValue(expired) });
    const view = await service.get(USER, EXAM);
    expect(repository.submit).toHaveBeenCalledWith(USER, EXAM);
    expect(view.session.status).toBe("completed");
    expect(view.items).toEqual([]);
  });

  it("returns no questions for a completed session", async () => {
    const { service, repository } = setup({
      getSession: vi.fn().mockResolvedValue(session({ status: "completed" })),
    });
    const view = await service.get(USER, EXAM);
    expect(view.items).toEqual([]);
    expect(repository.listItems).not.toHaveBeenCalled();
  });
});

describe("SessionService.saveAnswer", () => {
  const save = { examId: EXAM, questionId: "q1", answer: "B" as const };

  it("saves through the repository with the server's grace period", async () => {
    const { service, repository } = setup();
    await expect(
      service.saveAnswer(USER, { ...save, confidence: "high", flagged: true, timeSpentMs: 1200 }),
    ).resolves.toEqual({ ok: true });
    expect(repository.saveAnswer).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({
        answer: "B",
        confidence: "high",
        flagged: true,
        timeSpentMs: 1200,
      }),
      10,
    );
  });

  it("accepts a hint report as a change on its own", async () => {
    const { service, repository } = setup();
    await expect(
      service.saveAnswer(USER, { examId: EXAM, questionId: "q1", hintUsed: true }),
    ).resolves.toEqual({ ok: true });
    expect(repository.saveAnswer).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({ hintUsed: true }),
      10,
    );
  });

  it("reports a missing session or question as not found", async () => {
    const { service } = setup({ saveAnswer: vi.fn().mockResolvedValue("not_found") });
    await expect(service.saveAnswer(USER, save)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses answers once the session is closed", async () => {
    const { service } = setup({ saveAnswer: vi.fn().mockResolvedValue("closed") });
    await expect(service.saveAnswer(USER, save)).rejects.toBeInstanceOf(SessionClosedError);
  });

  it("refuses a save that changes nothing", async () => {
    const { service, repository } = setup();
    await expect(
      service.saveAnswer(USER, { examId: EXAM, questionId: "q1" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repository.saveAnswer).not.toHaveBeenCalled();
  });
});

describe("SessionService.submit", () => {
  it("returns the server-computed result", async () => {
    const { service, repository } = setup();
    await expect(service.submit(USER, EXAM)).resolves.toEqual(submitResult());
    expect(repository.submit).toHaveBeenCalledWith(USER, EXAM);
  });

  it("returns the stored result when submitted again", async () => {
    const { service } = setup({
      submit: vi.fn().mockResolvedValue(submitResult({ alreadyCompleted: true })),
    });
    await expect(service.submit(USER, EXAM)).resolves.toMatchObject({
      alreadyCompleted: true,
      correctCount: 1,
    });
  });

  it("refuses to submit a session the student does not own", async () => {
    const { service } = setup({
      submit: vi.fn().mockRejectedValue(new NotFoundError("Exam not found.")),
    });
    await expect(service.submit("intruder", EXAM)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("SessionService.submit and review scheduling", () => {
  it("brings the student's review schedule up to date after a first submission", async () => {
    const { service, afterScoring } = setup();
    await service.submit(USER, EXAM);
    expect(afterScoring).toHaveBeenCalledWith(USER);
  });

  it("does not reschedule when the exam had already been submitted", async () => {
    const { service, afterScoring } = setup({
      submit: vi.fn().mockResolvedValue(submitResult({ alreadyCompleted: true })),
    });
    await service.submit(USER, EXAM);
    expect(afterScoring).not.toHaveBeenCalled();
  });

  it("does not schedule anything when the submission itself fails", async () => {
    const { service, afterScoring } = setup({
      submit: vi.fn().mockRejectedValue(new NotFoundError("Exam not found.")),
    });
    await expect(service.submit("intruder", EXAM)).rejects.toBeInstanceOf(NotFoundError);
    expect(afterScoring).not.toHaveBeenCalled();
  });

  it("schedules after an exam that was finalised because its time ran out", async () => {
    const expired = session({ deadlineAt: "2026-10-06T09:59:00.000Z" });
    const { service, afterScoring } = setup({ getSession: vi.fn().mockResolvedValue(expired) });
    await service.get(USER, EXAM);
    expect(afterScoring).toHaveBeenCalledWith(USER);
  });
});

describe("SessionService.results", () => {
  const completed = session({
    status: "completed",
    correctCount: 1,
    scorePct: 50,
    completedAt: "2026-10-06T09:50:00.000Z",
  });
  const answered = [
    itemRow(1, { userAnswer: "A", isCorrect: true }),
    itemRow(2, { userAnswer: "C", isCorrect: false }),
  ];

  it("returns answers, correctness and rationale after completion", async () => {
    const { service } = setup({
      getSession: vi.fn().mockResolvedValue(completed),
      listItems: vi.fn().mockResolvedValue(answered),
    });
    const view = await service.results(USER, EXAM);
    expect(view.exam).toEqual({
      score_pct: 50,
      correct_count: 1,
      total_questions: 2,
      exam_type: "RN",
    });
    expect(view.items[0]).toMatchObject({
      user_answer: "A",
      is_correct: true,
      questions: { correct_answer: "A", rationale: "Secret rationale text" },
    });
  });

  it("withholds results while the session is still running", async () => {
    const { service, repository } = setup();
    await expect(service.results(USER, EXAM)).rejects.toBeInstanceOf(ConflictError);
    expect(repository.listItems).not.toHaveBeenCalled();
  });

  it("finalises an expired session before showing results", async () => {
    const expired = session({ deadlineAt: "2026-10-06T09:00:00.000Z" });
    const getSession = vi.fn().mockResolvedValueOnce(expired).mockResolvedValueOnce(completed);
    const { service, repository } = setup({
      getSession,
      listItems: vi.fn().mockResolvedValue(answered),
    });
    const view = await service.results(USER, EXAM);
    expect(repository.submit).toHaveBeenCalledWith(USER, EXAM);
    expect(view.exam.score_pct).toBe(50);
  });

  it("does not reveal another student's results", async () => {
    const { service } = setup({ getSession: vi.fn().mockResolvedValue(null) });
    await expect(service.results("intruder", EXAM)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("SessionService.start: focus selections", () => {
  it("builds a mistake review from the student's unresolved mistakes only, most recent first", async () => {
    const { service, repository } = setup({
      listFocusQuestionIds: vi.fn().mockResolvedValue(["q7", "q3", "q500"]),
    });
    const result = await service.start(USER, { ...input, selection: "mistakes", count: 10 });
    expect(repository.listFocusQuestionIds).toHaveBeenCalledWith(USER, "RN", "mistakes", NOW, 250);
    const record = vi.mocked(repository.startSession).mock.calls[0][0];
    expect(record.sessionType).toBe("mistake_review");
    expect([...record.questionIds].sort()).toEqual(["q3", "q7"]);
    expect(result.totalQuestions).toBe(2);
  });

  it("builds a revision session from the questions that are due for review", async () => {
    const { service, repository } = setup({
      listFocusQuestionIds: vi.fn().mockResolvedValue(["q1", "q2", "q4"]),
    });
    await service.start(USER, { ...input, selection: "due", count: 2 });
    const record = vi.mocked(repository.startSession).mock.calls[0][0];
    expect(record.sessionType).toBe("revision");
    expect(record.questionIds).toHaveLength(2);
    expect(["q1", "q2", "q4"]).toEqual(expect.arrayContaining(record.questionIds));
  });

  it.each([
    ["mistakes", "You have no mistakes to review yet."],
    ["due", "Nothing is due for review right now."],
  ] as const)(
    "says plainly when there is nothing to practise (%s), starting nothing",
    async (selection, message) => {
      const { service, repository } = setup();
      await expect(service.start(USER, { ...input, selection })).rejects.toThrow(message);
      expect(repository.startSession).not.toHaveBeenCalled();
    },
  );

  it("still applies the tier and daily limits to a focus session", async () => {
    const { service, repository } = setup({
      getQuota: vi
        .fn()
        .mockResolvedValue(quota({ questionsToday: 50, lastQuestionDate: "2026-10-06" })),
      listFocusQuestionIds: vi.fn().mockResolvedValue(["q1"]),
    });
    await expect(
      service.start(USER, { ...input, selection: "mistakes", count: 10 }),
    ).rejects.toBeInstanceOf(LimitReachedError);
    expect(repository.startSession).not.toHaveBeenCalled();
  });

  it("ignores a focus question the bank no longer offers (retired, incomplete or another exam type)", async () => {
    const { service, repository } = setup({
      listFocusQuestionIds: vi.fn().mockResolvedValue(["gone", "q1"]),
    });
    await service.start(USER, { ...input, selection: "mistakes", count: 10 });
    expect(vi.mocked(repository.startSession).mock.calls[0][0].questionIds).toEqual(["q1"]);
  });

  it("keeps a topic filter: only focus questions of that topic", async () => {
    const { service, repository } = setup({
      listQuestionPool: vi.fn(async (_type: string, topic: string | null) =>
        pool(80).filter((q) => topic === null || q.topic === topic),
      ),
      listFocusQuestionIds: vi.fn().mockResolvedValue(["q1", "q2"]),
    });
    await service.start(USER, { ...input, category: "Pharmacology", selection: "mistakes" });
    expect(repository.listQuestionPool).toHaveBeenCalledWith("RN", "Pharmacology");
    expect(vi.mocked(repository.startSession).mock.calls[0][0].questionIds).toEqual(["q2"]);
  });
});

describe("SessionService.start: why each question was chosen", () => {
  const recorded = (repository: SessionRepository) =>
    vi.mocked(repository.recordSelectionReasons).mock.calls[0];

  it("records 'random' for every question of a random session, for the new session and the student", async () => {
    const { service, repository } = setup();
    await service.start(USER, { ...input, count: 4 });
    const [user, exam, reasons] = recorded(repository);
    const ids = vi.mocked(repository.startSession).mock.calls[0][0].questionIds;
    expect(user).toBe(USER);
    expect(exam).toBe(EXAM);
    expect(reasons).toEqual(Object.fromEntries(ids.map((id) => [id, "random"])));
  });

  it("records the signal that put each question into an adaptive session", async () => {
    const { service, repository, adaptiveSelection } = setup();
    adaptiveSelection.pickWithReasons.mockImplementationOnce(
      async (_u: string, candidates: readonly PoolQuestion[]) => [
        { question: candidates[0], reason: "due_review" },
        { question: candidates[1], reason: "previous_mistake" },
      ],
    );
    await service.start(USER, { ...input, count: 2, selection: "adaptive" });
    expect(recorded(repository)[2]).toEqual({ q1: "due_review", q2: "previous_mistake" });
  });

  it("records the focus a mistakes or due session was built from", async () => {
    const mistakes = setup({ listFocusQuestionIds: vi.fn().mockResolvedValue(["q3", "q4"]) });
    await mistakes.service.start(USER, { ...input, count: 2, selection: "mistakes" });
    expect(recorded(mistakes.repository)[2]).toEqual({
      q3: "previous_mistake",
      q4: "previous_mistake",
    });

    const due = setup({ listFocusQuestionIds: vi.fn().mockResolvedValue(["q5"]) });
    await due.service.start(USER, { ...input, count: 1, selection: "due" });
    expect(recorded(due.repository)[2]).toEqual({ q5: "due_review" });
  });

  it("still starts the session when the reasons cannot be recorded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { service } = setup({
      recordSelectionReasons: vi.fn().mockRejectedValue(new Error("db down")),
    });
    await expect(service.start(USER, input)).resolves.toMatchObject({ examId: EXAM });
  });

  it("does not record anything when the session could not start", async () => {
    const { service, repository } = setup({
      startSession: vi.fn().mockRejectedValue(new ConflictError("busy")),
    });
    await expect(service.start(USER, input)).rejects.toBeInstanceOf(ConflictError);
    expect(repository.recordSelectionReasons).not.toHaveBeenCalled();
  });
});

describe("SessionService.results: why each question was chosen", () => {
  it("shows the reason on each result row, and nothing for a session started before reasons were kept", async () => {
    const { service } = setup({
      getSession: vi.fn().mockResolvedValue(session({ status: "completed" })),
      listItems: vi
        .fn()
        .mockResolvedValue([
          itemRow(1, { selectionReason: "weak_topic" }),
          itemRow(2, { selectionReason: null }),
        ]),
    });
    const view = await service.results(USER, EXAM);
    expect(view.items.map((item) => item.selection_reason)).toEqual(["weak_topic", null]);
  });

  it("never puts the reason on a question still being answered", async () => {
    const { service } = setup({
      listItems: vi.fn().mockResolvedValue([itemRow(1, { selectionReason: "weak_topic" })]),
    });
    const view = await service.get(USER, EXAM);
    expect(JSON.stringify(view)).not.toContain("weak_topic");
  });
});

describe("SessionService.start: similar to a question", () => {
  const SOURCE = "123e4567-e89b-42d3-a456-426614174000";
  const similarInput = { ...input, count: 5, selection: "similar" as const, similarTo: SOURCE };

  it("asks for the questions most like the one the student chose, and starts a session of exactly those", async () => {
    const { service, repository, similar } = setup();
    await service.start(USER, similarInput);

    expect(similar.find).toHaveBeenCalledWith(USER, SOURCE, 5);
    const record = vi.mocked(repository.startSession).mock.calls[0][0];
    expect(record.questionIds).toEqual(["q7", "q3"]);
    expect(record.sessionType).toBe("mixed");
    expect(vi.mocked(repository.recordSelectionReasons).mock.calls[0][2]).toEqual({
      q7: "similar",
      q3: "similar",
    });
  });

  it("starts a topic session when the student chose a topic", async () => {
    const { service, repository } = setup();
    await service.start(USER, { ...similarInput, category: "Pharmacology" });
    expect(vi.mocked(repository.startSession).mock.calls[0][0].sessionType).toBe("topic_practice");
  });

  it("offers only questions that are active, complete and of this exam", async () => {
    const { service, repository } = setup({
      listQuestionPool: vi
        .fn()
        .mockResolvedValue([question(7), question(3, { question_text: "34." })]),
    });
    await service.start(USER, similarInput);
    expect(vi.mocked(repository.startSession).mock.calls[0][0].questionIds).toEqual(["q7"]);
  });

  it("refuses without a question to be similar to", async () => {
    const { service, repository } = setup();
    await expect(service.start(USER, { ...input, selection: "similar" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repository.startSession).not.toHaveBeenCalled();
  });

  it("tells the student when nothing similar is available", async () => {
    const { service, repository } = setup();
    const empty = { find: vi.fn().mockResolvedValue({ source: {}, items: [] }) };
    const alone = new SessionService({
      repository,
      clock: () => NOW,
      random: () => 0,
      afterScoring: vi.fn(),
      adaptiveSelection: { pickWithReasons: vi.fn() },
      similar: empty,
    });
    await expect(alone.start(USER, similarInput)).rejects.toThrow(/no similar questions/i);
    expect(repository.startSession).not.toHaveBeenCalled();
    expect(service).toBeDefined();
  });

  it("lets a question the student never answered fail the way an unknown one does", async () => {
    const { service, similar } = setup();
    similar.find.mockRejectedValueOnce(new NotFoundError("Question not found."));
    await expect(service.start(USER, similarInput)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("SessionService.history", () => {
  const row = (n: number, overrides: Partial<HistoryRow> = {}): HistoryRow => ({
    id: `exam-${n}`,
    examType: "RN",
    category: ALL_AREAS,
    sessionType: "mixed",
    completedAt: `2026-10-0${n}T09:50:00.000Z`,
    totalQuestions: 10,
    correctCount: 7,
    scorePct: 70,
    scoreVerified: true,
    autoSubmitted: false,
    ...overrides,
  });

  it("lists the student's finished tests as the repository returns them, for that student only", async () => {
    const listCompleted = vi.fn().mockResolvedValue([row(2), row(1)]);
    const { service } = setup({ listCompleted });
    const history = await service.history(USER, 10);
    expect(listCompleted).toHaveBeenCalledWith(USER, 10);
    expect(history.exams.map((exam) => exam.id)).toEqual(["exam-2", "exam-1"]);
  });

  it("averages only scores the server has verified against the answer key", async () => {
    const { service } = setup({
      listCompleted: vi
        .fn()
        .mockResolvedValue([
          row(3, { scorePct: 80 }),
          row(2, { scorePct: 61.25 }),
          row(1, { scorePct: 100, scoreVerified: false }),
        ]),
    });
    const history = await service.history(USER, 10);
    expect(history.verifiedCount).toBe(2);
    expect(history.unverifiedCount).toBe(1);
    expect(history.averageScorePct).toBe(70.6);
  });

  it("has no average, rather than a zero, when no verified test exists", async () => {
    const { service } = setup({
      listCompleted: vi.fn().mockResolvedValue([row(1, { scoreVerified: false })]),
    });
    expect((await service.history(USER, 10)).averageScorePct).toBeNull();
    const { service: empty } = setup();
    expect(await empty.history(USER, 10)).toEqual({
      exams: [],
      verifiedCount: 0,
      unverifiedCount: 0,
      averageScorePct: null,
    });
  });
});
