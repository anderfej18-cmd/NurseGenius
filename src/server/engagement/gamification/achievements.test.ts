import { describe, expect, it } from "vitest";
import { achievementProgress, type EngagementSnapshot, evaluateAchievements } from "./achievements";
import { GAMIFICATION_CONFIG } from "./gamification.config";

const NOTHING: EngagementSnapshot = {
  sessions_completed: 0,
  questions_answered: 0,
  correct_answers: 0,
  perfect_sessions: 0,
  topics_practised: 0,
  longest_streak: 0,
  level: 1,
  daily_challenges_completed: 0,
};
const snapshot = (overrides: Partial<EngagementSnapshot>): EngagementSnapshot => ({
  ...NOTHING,
  ...overrides,
});
const codes = (list: ReadonlyArray<{ code: string }>) => list.map((a) => a.code);

describe("evaluateAchievements", () => {
  it("unlocks nothing for a student who has done nothing", () => {
    expect(evaluateAchievements(NOTHING, [])).toEqual([]);
  });

  it("unlocks an achievement exactly when its metric reaches the target", () => {
    expect(codes(evaluateAchievements(snapshot({ questions_answered: 99 }), []))).toEqual([]);
    expect(codes(evaluateAchievements(snapshot({ questions_answered: 100 }), []))).toEqual([
      "answers_100",
    ]);
  });

  it("unlocks every threshold passed, in the order of the definitions", () => {
    const earned = evaluateAchievements(
      snapshot({ sessions_completed: 12, longest_streak: 7, level: 5 }),
      [],
    );
    expect(codes(earned)).toEqual([
      "first_session",
      "sessions_10",
      "streak_3",
      "streak_7",
      "level_5",
    ]);
  });

  it("does not unlock again what is already unlocked", () => {
    const earned = evaluateAchievements(snapshot({ sessions_completed: 12 }), ["first_session"]);
    expect(codes(earned)).toEqual(["sessions_10"]);
  });

  it("finds nothing new once its own result has been recorded", () => {
    const state = snapshot({
      sessions_completed: 60,
      questions_answered: 600,
      perfect_sessions: 1,
    });
    const first = evaluateAchievements(state, []);
    expect(first.length).toBeGreaterThan(3);
    expect(evaluateAchievements(state, codes(first))).toEqual([]);
  });

  it("carries the title, description and XP of the definition", () => {
    const [earned] = evaluateAchievements(snapshot({ perfect_sessions: 1 }), []);
    expect(earned).toEqual({
      code: "perfect_session",
      title: "Perfect session",
      description: "Answer every question right in a session of at least 10.",
      xp: 50,
    });
  });

  it("unlocks the daily-challenge achievements at 1 and 7 finished challenges", () => {
    expect(codes(evaluateAchievements(snapshot({ daily_challenges_completed: 1 }), []))).toEqual([
      "daily_challenge_1",
    ]);
    expect(codes(evaluateAchievements(snapshot({ daily_challenges_completed: 7 }), []))).toEqual([
      "daily_challenge_1",
      "daily_challenge_7",
    ]);
  });

  it("follows the configured definitions", () => {
    const config = {
      ...GAMIFICATION_CONFIG,
      achievements: [
        {
          code: "tiny",
          title: "Tiny",
          description: "d",
          xp: 1,
          metric: "correct_answers",
          atLeast: 2,
        },
      ],
    } as const;
    expect(codes(evaluateAchievements(snapshot({ correct_answers: 2 }), [], config))).toEqual([
      "tiny",
    ]);
  });
});

describe("achievementProgress", () => {
  it("lists every definition with how far the student has come", () => {
    const list = achievementProgress(snapshot({ questions_answered: 250 }), []);
    expect(list).toHaveLength(GAMIFICATION_CONFIG.achievements.length);
    expect(list.find((a) => a.code === "answers_500")).toMatchObject({
      unlocked: false,
      current: 250,
      target: 500,
      progress: 0.5,
    });
  });

  it("marks unlocked ones complete, and never reports more than 100%", () => {
    const list = achievementProgress(snapshot({ questions_answered: 700 }), ["answers_100"]);
    expect(list.find((a) => a.code === "answers_100")).toMatchObject({
      unlocked: true,
      progress: 1,
    });
    expect(list.find((a) => a.code === "answers_500")).toMatchObject({
      unlocked: false,
      progress: 1,
    });
  });

  it("reports an unlocked achievement as complete even if the metric later falls", () => {
    // The longest streak cannot fall, but a level or counter source might be recomputed lower.
    const list = achievementProgress(snapshot({ longest_streak: 1 }), ["streak_7"]);
    expect(list.find((a) => a.code === "streak_7")).toMatchObject({ unlocked: true, progress: 1 });
  });
});
