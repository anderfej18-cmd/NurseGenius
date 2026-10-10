import { describe, expect, it } from "vitest";
import { ConflictError, LimitReachedError, NotFoundError } from "@/lib/app-errors";
import { createFakeSupabase } from "../../testing/fake-supabase";
import { SupabaseFriendChallengeStore } from "./friend-challenge.repository.server";

const USER = "user-1";
const argsOf = (fake: ReturnType<typeof createFakeSupabase>, fn: string) =>
  fake.callsOn(`rpc:${fn}`, "args")[0].args[0];

const row = {
  id: "c1",
  role: "opponent",
  opponent_username: "alice",
  exam_type: "RN",
  total_questions: 10,
  created_at: "2026-10-09T12:00:00.000Z",
  expires_at: "2026-10-16T12:00:00.000Z",
  declined_at: null,
  my_exam_id: "e1",
  my_exam_status: "completed",
  my_correct: 7,
  my_score_pct: "70.00",
  my_completed_at: "2026-10-10T09:00:00.000Z",
  their_exam_status: "completed",
  their_correct: 5,
  their_score_pct: "50.00",
  their_completed_at: "2026-10-10T08:00:00.000Z",
};
const mapped = {
  id: "c1",
  role: "opponent",
  opponentUsername: "alice",
  examType: "RN",
  totalQuestions: 10,
  createdAt: new Date("2026-10-09T12:00:00.000Z"),
  expiresAt: new Date("2026-10-16T12:00:00.000Z"),
  declinedAt: null,
  myExamId: "e1",
  myExamStatus: "completed",
  myCorrect: 7,
  myScorePct: 70,
  myCompletedAt: new Date("2026-10-10T09:00:00.000Z"),
  theirExamStatus: "completed",
  theirCorrect: 5,
  theirScorePct: 50,
  theirCompletedAt: new Date("2026-10-10T08:00:00.000Z"),
};
const withheld = {
  ...row,
  my_exam_id: null,
  my_exam_status: null,
  my_correct: null,
  my_score_pct: null,
  my_completed_at: null,
  their_exam_status: "completed",
  their_correct: null,
  their_score_pct: null,
  their_completed_at: null,
};

describe("SupabaseFriendChallengeStore.createChallenge", () => {
  it("names the signed-in student, the friendship, the questions and the limits", async () => {
    const fake = createFakeSupabase([{ data: "c-new" }]);
    const id = await new SupabaseFriendChallengeStore(fake.client).createChallenge(
      USER,
      "f1",
      "RN",
      ["q1", "q2"],
      new Date("2026-10-17T12:00:00.000Z"),
      10,
    );
    expect(argsOf(fake, "create_friend_challenge")).toEqual({
      _user_id: USER,
      _friendship_id: "f1",
      _exam_type: "RN",
      _question_ids: ["q1", "q2"],
      _expires_at: "2026-10-17T12:00:00.000Z",
      _max_open: 10,
    });
    expect(id).toBe("c-new");
  });

  it.each([
    ["friendship_not_found", NotFoundError],
    ["challenge_limit", LimitReachedError],
  ])("turns the database's %s into a typed error", async (message, expected) => {
    const fake = createFakeSupabase([{ error: { message: `ERROR: ${message}` } }]);
    await expect(
      new SupabaseFriendChallengeStore(fake.client).createChallenge(
        USER,
        "f1",
        "RN",
        ["q1"],
        new Date(),
        1,
      ),
    ).rejects.toBeInstanceOf(expected);
  });
});

describe("SupabaseFriendChallengeStore.declineChallenge", () => {
  it("names the signed-in student and the challenge", async () => {
    const fake = createFakeSupabase([{ data: null }]);
    await new SupabaseFriendChallengeStore(fake.client).declineChallenge(USER, "c1");
    expect(argsOf(fake, "decline_friend_challenge")).toEqual({
      _user_id: USER,
      _challenge_id: "c1",
    });
  });

  it("turns a challenge that is not theirs to decline into not found", async () => {
    const fake = createFakeSupabase([{ error: { message: "ERROR: challenge_not_found" } }]);
    await expect(
      new SupabaseFriendChallengeStore(fake.client).declineChallenge(USER, "c1"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("SupabaseFriendChallengeStore.startSession", () => {
  it("names the signed-in student, the challenge, the minutes and today", async () => {
    const fake = createFakeSupabase([{ data: "exam-1" }]);
    const examId = await new SupabaseFriendChallengeStore(fake.client).startSession(
      USER,
      "c1",
      15,
      "2026-10-10",
    );
    expect(argsOf(fake, "start_friend_challenge_session")).toEqual({
      _user_id: USER,
      _challenge_id: "c1",
      _time_limit_minutes: 15,
      _today: "2026-10-10",
    });
    expect(examId).toBe("exam-1");
  });

  it.each([
    ["challenge_closed", ConflictError],
    ["active_session_exists", ConflictError],
    ["challenge_not_found", NotFoundError],
  ])("turns the database's %s into a typed error", async (message, expected) => {
    const fake = createFakeSupabase([{ error: { message: `ERROR: ${message}` } }]);
    await expect(
      new SupabaseFriendChallengeStore(fake.client).startSession(USER, "c1", 15, "2026-10-10"),
    ).rejects.toBeInstanceOf(expected);
  });
});

describe("SupabaseFriendChallengeStore.getView", () => {
  it("asks for this student's view of one challenge and maps it", async () => {
    const fake = createFakeSupabase([{ data: [row] }]);
    const view = await new SupabaseFriendChallengeStore(fake.client).getView(USER, "c1");
    expect(argsOf(fake, "get_friend_challenge_views")).toEqual({
      _user_id: USER,
      _challenge_id: "c1",
      _limit: 1,
      _offset: 0,
    });
    expect(view).toEqual(mapped);
  });

  it("is null when the challenge is not the student's", async () => {
    const fake = createFakeSupabase([{ data: [] }]);
    expect(await new SupabaseFriendChallengeStore(fake.client).getView(USER, "c1")).toBeNull();
  });

  it("keeps the opponent's withheld result empty rather than zero", async () => {
    const fake = createFakeSupabase([{ data: [withheld] }]);
    const view = await new SupabaseFriendChallengeStore(fake.client).getView(USER, "c1");
    expect(view).toMatchObject({
      myExamStatus: null,
      myScorePct: null,
      theirExamStatus: "completed",
      theirCorrect: null,
      theirScorePct: null,
    });
  });

  it("rejects a row that is not shaped like a challenge", async () => {
    const fake = createFakeSupabase([{ data: [{ ...row, role: "spectator" }] }]);
    await expect(
      new SupabaseFriendChallengeStore(fake.client).getView(USER, "c1"),
    ).rejects.toThrow();
  });
});

describe("SupabaseFriendChallengeStore.listViews", () => {
  it("asks for one page of this student's challenges, with no challenge named", async () => {
    const fake = createFakeSupabase([{ data: [row, { ...row, id: "c2" }] }]);
    const views = await new SupabaseFriendChallengeStore(fake.client).listViews(USER, {
      limit: 21,
      offset: 20,
    });
    expect(argsOf(fake, "get_friend_challenge_views")).toEqual({
      _user_id: USER,
      _limit: 21,
      _offset: 20,
    });
    expect(views.map((view) => view.id)).toEqual(["c1", "c2"]);
  });

  it("passes an unexpected database error on to be logged, not shown", async () => {
    const fake = createFakeSupabase([{ error: { message: "boom" } }]);
    await expect(
      new SupabaseFriendChallengeStore(fake.client).listViews(USER, { limit: 1, offset: 0 }),
    ).rejects.toEqual({ message: "boom" });
  });
});
