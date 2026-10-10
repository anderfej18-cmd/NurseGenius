/**
 * Rules of XP, levels and achievements (documented in docs/formulas.md, section 11). XP is paid by
 * the server for things it has recorded; there is no way for a client to ask for any.
 */

/** A counter the achievement rules can read. */
export type SnapshotMetric =
  | "sessions_completed"
  | "questions_answered"
  | "correct_answers"
  | "perfect_sessions"
  | "topics_practised"
  | "longest_streak"
  | "level"
  | "daily_challenges_completed";

export interface AchievementDefinition {
  /** Stable identifier stored in the database. */
  readonly code: string;
  readonly title: string;
  readonly description: string;
  /** XP paid once, when the achievement unlocks. */
  readonly xp: number;
  /** Unlocks when the metric reaches this value. */
  readonly metric: SnapshotMetric;
  readonly atLeast: number;
}

export interface GamificationConfig {
  readonly xp: {
    /** Per question answered correctly for the first time ever; repeating a question pays nothing. */
    readonly firstCorrect: number;
    /** Once per UTC day, for answering at least `minAnswered` questions. */
    readonly dailyPractice: { readonly minAnswered: number; readonly xp: number };
    /** Once per UTC day, for a session of at least `minAnswered` questions with every answer right. */
    readonly perfectSession: { readonly minAnswered: number; readonly xp: number };
    /** For a finished daily challenge: per right answer, plus a bonus when every answer is right. */
    readonly dailyChallenge: { readonly perCorrect: number; readonly perfectBonus: number };
  };
  readonly levels: {
    /** Level n starts at baseXp × (n − 1) × n / 2 XP. */
    readonly baseXp: number;
    readonly maxLevel: number;
  };
  /** A topic counts as practised with at least this many answered attempts. */
  readonly topicPractisedMinAttempts: number;
  readonly achievements: readonly AchievementDefinition[];
}

export const GAMIFICATION_CONFIG = {
  xp: {
    firstCorrect: 10,
    dailyPractice: { minAnswered: 5, xp: 20 },
    perfectSession: { minAnswered: 10, xp: 20 },
    dailyChallenge: { perCorrect: 8, perfectBonus: 10 },
  },
  levels: { baseXp: 100, maxLevel: 100 },
  topicPractisedMinAttempts: 5,
  achievements: [
    {
      code: "first_session",
      title: "First session",
      description: "Complete a practice session.",
      xp: 25,
      metric: "sessions_completed",
      atLeast: 1,
    },
    {
      code: "sessions_10",
      title: "Getting into the habit",
      description: "Complete 10 sessions.",
      xp: 50,
      metric: "sessions_completed",
      atLeast: 10,
    },
    {
      code: "sessions_50",
      title: "Dedicated",
      description: "Complete 50 sessions.",
      xp: 150,
      metric: "sessions_completed",
      atLeast: 50,
    },
    {
      code: "answers_100",
      title: "100 questions",
      description: "Answer 100 questions.",
      xp: 50,
      metric: "questions_answered",
      atLeast: 100,
    },
    {
      code: "answers_500",
      title: "500 questions",
      description: "Answer 500 questions.",
      xp: 150,
      metric: "questions_answered",
      atLeast: 500,
    },
    {
      code: "answers_1000",
      title: "1,000 questions",
      description: "Answer 1,000 questions.",
      xp: 300,
      metric: "questions_answered",
      atLeast: 1000,
    },
    {
      code: "perfect_session",
      title: "Perfect session",
      description: "Answer every question right in a session of at least 10.",
      xp: 50,
      metric: "perfect_sessions",
      atLeast: 1,
    },
    {
      code: "topics_5",
      title: "Wide reader",
      description: "Practise 5 topics, at least 5 questions each.",
      xp: 75,
      metric: "topics_practised",
      atLeast: 5,
    },
    {
      code: "streak_3",
      title: "Three in a row",
      description: "Study 3 days in a row.",
      xp: 30,
      metric: "longest_streak",
      atLeast: 3,
    },
    {
      code: "streak_7",
      title: "A full week",
      description: "Study 7 days in a row.",
      xp: 75,
      metric: "longest_streak",
      atLeast: 7,
    },
    {
      code: "streak_30",
      title: "A full month",
      description: "Study 30 days in a row.",
      xp: 300,
      metric: "longest_streak",
      atLeast: 30,
    },
    {
      code: "daily_challenge_1",
      title: "Challenger",
      description: "Finish a daily challenge.",
      xp: 40,
      metric: "daily_challenges_completed",
      atLeast: 1,
    },
    {
      code: "daily_challenge_7",
      title: "Challenge week",
      description: "Finish 7 daily challenges.",
      xp: 150,
      metric: "daily_challenges_completed",
      atLeast: 7,
    },
    {
      code: "level_5",
      title: "Level 5",
      description: "Reach level 5.",
      xp: 100,
      metric: "level",
      atLeast: 5,
    },
    {
      code: "level_10",
      title: "Level 10",
      description: "Reach level 10.",
      xp: 250,
      metric: "level",
      atLeast: 10,
    },
  ],
} as const satisfies GamificationConfig;

/** How much catching up one request may do (docs/adr/0004). */
export const GAMIFICATION_SYNC = {
  /** Finished sessions (and challenges) worked out per round trip. */
  batchSize: 50,
  /** Rounds per request; anything left is picked up by the next request. */
  maxBatches: 4,
  /** Achievement XP can lift the level and unlock more; this bounds the chain. */
  maxAchievementRounds: 3,
  /** Ledger entries shown in the summary. */
  recentEvents: 10,
} as const;
