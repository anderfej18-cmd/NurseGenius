import { describe, expect, it } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/app-errors";
import { createFakeSupabase } from "../../testing/fake-supabase";
import { SupabaseDailyChallengeStore } from "./daily-challenge.repository.server";

const USER = "user-1";
const rpcArgs = (fake: ReturnType<typeof createFakeSupabase>, fn: string) =>
  fake.callsOn(`rpc:${fn}`, "args")[0].args[0];

describe("SupabaseDailyChallengeStore.getProfile", () => {
  it("reads the student's own tier, daily counter and exam preference", async () => {
    const fake = createFakeSupabase([
      {
        data: {
          exam_preference: "RM",
          tier: "erudite",
          expiry_date: "2027-01-01T00:00:00Z",
          questions_today: 12,
          last_question_date: "2026-10-10",
        },
      },
    ]);
    const profile = await new SupabaseDailyChallengeStore(fake.client).getProfile(USER);

    expect(String(fake.callsOn("from:profiles", "select")[0].args[0])).toBe(
      "exam_preference, tier, expiry_date, questions_today, last_question_date",
    );
    expect(fake.recorded[0].chain.map((c) => [c.method, ...c.args])).toEqual(
      expect.arrayContaining([["eq", "id", USER]]),
    );
    expect(profile).toEqual({
      examPreference: "RM",
      quota: {
        tier: "erudite",
        expiryDate: "2027-01-01T00:00:00Z",
        questionsToday: 12,
        lastQuestionDate: "2026-10-10",
      },
    });
  });

  it("reports a missing profile as null", async () => {
    const fake = createFakeSupabase([{ data: null }]);
    expect(await new SupabaseDailyChallengeStore(fake.client).getProfile(USER)).toBeNull();
  });
});

describe("SupabaseDailyChallengeStore.getChallengeView", () => {
  const row = {
    id: "c1",
    challenge_date: "2026-10-10",
    exam_type: "RN",
    total_questions: 5,
    exam_id: "e1",
    exam_status: "completed",
    correct_count: 4,
    score_pct: "80.00",
    completed_at: "2026-10-10T09:00:00.000Z",
  };

  it("asks for this student's challenge of the day and maps it", async () => {
    const fake = createFakeSupabase([{ data: [row] }]);
    const view = await new SupabaseDailyChallengeStore(fake.client).getChallengeView(
      USER,
      "2026-10-10",
    );
    expect(rpcArgs(fake, "get_daily_challenge_view")).toEqual({
      _user_id: USER,
      _date: "2026-10-10",
    });
    expect(view).toEqual({
      id: "c1",
      challengeDate: "2026-10-10",
      examType: "RN",
      totalQuestions: 5,
      examId: "e1",
      examStatus: "completed",
      correct: 4,
      scorePct: 80,
      completedAt: new Date("2026-10-10T09:00:00.000Z"),
    });
  });

  it("maps a challenge that was not started", async () => {
    const fake = createFakeSupabase([
      {
        data: [
          {
            ...row,
            exam_id: null,
            exam_status: null,
            correct_count: null,
            score_pct: null,
            completed_at: null,
          },
        ],
      },
    ]);
    expect(
      await new SupabaseDailyChallengeStore(fake.client).getChallengeView(USER, "2026-10-10"),
    ).toMatchObject({
      examId: null,
      examStatus: null,
      correct: null,
      scorePct: null,
      completedAt: null,
    });
  });

  it("returns null when there is no challenge for the day", async () => {
    const fake = createFakeSupabase([{ data: [] }]);
    expect(
      await new SupabaseDailyChallengeStore(fake.client).getChallengeView(USER, "2026-10-10"),
    ).toBeNull();
  });

  it("fails loudly on a row the database should never produce", async () => {
    const fake = createFakeSupabase([{ data: [{ ...row, exam_type: "MD" }] }]);
    await expect(
      new SupabaseDailyChallengeStore(fake.client).getChallengeView(USER, "2026-10-10"),
    ).rejects.toThrow();
  });
});

describe("SupabaseDailyChallengeStore: writing", () => {
  it("stores the day's questions for this student and returns the challenge id", async () => {
    const fake = createFakeSupabase([{ data: "c1" }]);
    const id = await new SupabaseDailyChallengeStore(fake.client).createChallenge(
      USER,
      "2026-10-10",
      "RN",
      ["q1", "q2"],
    );
    expect(id).toBe("c1");
    expect(rpcArgs(fake, "create_daily_challenge")).toEqual({
      _user_id: USER,
      _date: "2026-10-10",
      _exam_type: "RN",
      _question_ids: ["q1", "q2"],
    });
  });

  it("starts the challenge's session for this student only", async () => {
    const fake = createFakeSupabase([{ data: "exam-1" }]);
    const examId = await new SupabaseDailyChallengeStore(fake.client).startChallengeSession(
      USER,
      "c1",
      10,
      "2026-10-10",
    );
    expect(examId).toBe("exam-1");
    expect(rpcArgs(fake, "start_challenge_session")).toEqual({
      _user_id: USER,
      _challenge_id: "c1",
      _time_limit_minutes: 10,
      _today: "2026-10-10",
    });
  });

  it.each([
    ["invalid_question_set", ValidationError, "createChallenge"],
    ["active_session_exists", ConflictError, "startChallengeSession"],
    ["challenge_not_found", NotFoundError, "startChallengeSession"],
  ] as const)("turns the database's %s into a typed error", async (message, expected, method) => {
    const fake = createFakeSupabase([{ error: { message: `ERROR: ${message}` } }]);
    const store = new SupabaseDailyChallengeStore(fake.client);
    const call =
      method === "createChallenge"
        ? store.createChallenge(USER, "2026-10-10", "RN", ["q1"])
        : store.startChallengeSession(USER, "c1", 10, "2026-10-10");
    await expect(call).rejects.toBeInstanceOf(expected);
  });
});
