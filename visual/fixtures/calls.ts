// Typed fixtures for the server functions the harness views need. Each is typed against the real
// function's return type, so a change to a function's contract fails `tsc -p visual` instead of
// silently drifting. Add a function here when a view needs it; a missing one shows the error state.
import type {
  getExamResults,
  getExamSession,
  listExamHistory,
} from "@/functions/sessions.functions";
import type {
  getDailyChallenge,
  getGamificationSummary,
  getStudyPlan,
  getStudyStreak,
} from "@/functions/engagement.functions";
import type {
  getConfidenceAnalytics,
  getDailyRecommendation,
  getExamReadiness,
  getPerformanceAnalysis,
  getSimilarQuestions,
  getTimeAnalytics,
} from "@/functions/intelligence.functions";
import type { getAiInsight } from "@/functions/ai-insights.functions";
import type { listPublicPlans } from "@/functions/plans.functions";
import type { listBookmarks } from "@/functions/bookmarks.functions";
import type { listMistakes } from "@/functions/mistakes.functions";
import type { listNotifications } from "@/functions/notifications.functions";
import type { listFriendChallenges, listFriends } from "@/functions/competition.functions";
import type {
  getSharedAttempt,
  getSharedTest,
  startSharedTest,
  submitSharedTest,
} from "@/functions/custom-tests.functions";
import type { getLeaderboard } from "@/functions/leaderboard.functions";
import type { getTopicCounts } from "@/functions/questions.functions";
import type { getUnreadNotificationCount } from "@/functions/notifications.functions";
import type { getTopicMastery } from "@/functions/intelligence.functions";
import { adminFixtures } from "./admin";
import type { FixtureMap } from "./runtime";

type Out<F> = F extends (...args: never[]) => Promise<infer R> ? R : never;

export type FixtureState = "default" | "empty";

const daysAgo = (days: number): string => new Date(Date.now() - days * 86_400_000).toISOString();

const history: Out<typeof listExamHistory> = {
  exams: [
    ["RN", "Fundamentals of nursing", 38, 31, 81.6],
    ["RN", "All Areas", 50, 33, 66],
    ["RM", "Antenatal care", 25, 12, 48],
    ["RN", "Pharmacology", 30, 25, 83.3],
  ].map(([examType, category, total, correct, pct], index) => ({
    id: `fixture-exam-${index}`,
    examType: examType as "RN" | "RM",
    category: String(category),
    sessionType: "topic_practice",
    completedAt: daysAgo(index + 1),
    totalQuestions: Number(total),
    correctCount: Number(correct),
    scorePct: Number(pct),
    scoreVerified: true,
    autoSubmitted: false,
  })),
  verifiedCount: 4,
  unverifiedCount: 0,
  averageScorePct: 69.7,
};

const mastery: Out<typeof getTopicMastery> = {
  topics: [
    ["Antenatal care", 41, "weak", 22],
    ["Pharmacology", 63, "developing", 64],
    ["Fundamentals of nursing", 78, "proficient", 90],
  ].map(([topic, score, level, attempts]) => ({
    topic: String(topic),
    attempts: Number(attempts),
    score: Number(score),
    rawScore: Number(score) / 100,
    evidence: Number(attempts) / (Number(attempts) + 10),
    level: level as "weak" | "developing" | "proficient",
    trend: "stable" as const,
    components: {
      accuracy: 0.6,
      recency: 0.6,
      consistency: null,
      difficulty: null,
      calibration: null,
    },
    componentsUsed: ["accuracy", "recency"] as const,
    penalties: { repeatedMistakes: 0 },
  })),
  overall: { score: 61, level: "developing", evidence: 0.9, attempts: 176 },
};

const topicCounts = (input: unknown): Out<typeof getTopicCounts> =>
  (input as { examType?: string } | undefined)?.examType === "RM"
    ? { "Antenatal care": 84, "Labour and delivery": 61, "Postnatal care": 47, "Neonatal care": 38 }
    : {
        "Fundamentals of nursing": 140,
        Pharmacology: 112,
        "Medical-surgical nursing": 168,
        "Maternal and child health": 76,
        "Mental health nursing": 54,
      };

const stems = [
  [
    "Fundamentals of nursing",
    "Which action best prevents the spread of infection between patients?",
    "Hand hygiene before and after contact",
    "Wearing gloves for all tasks",
    "Isolating every patient",
    "Using the same stethoscope",
  ],
  [
    "Pharmacology",
    "Before giving a prescribed dose, which check comes first?",
    "Confirm the patient's identity",
    "Read the previous shift's notes",
    "Ask the family",
    "Prepare the dose",
  ],
  [
    "Medical-surgical nursing",
    "A patient two days after surgery has a rising temperature and a red, warm wound. What should the nurse do first?",
    "Assess the wound and report findings",
    "Apply a heat pack",
    "Encourage a larger meal",
    "Wait until the morning review",
  ],
  [
    "Maternal and child health",
    "Which finding after delivery needs immediate attention?",
    "Heavy bleeding that soaks a pad in minutes",
    "Mild afterpains",
    "A tender breast on day three",
    "Light lochia",
  ],
] as const;

const sessionItems = (count: number): Out<typeof getExamSession>["items"] =>
  Array.from({ length: count }, (_, index) => {
    const [topic, text, a, b, c, d] = stems[index % stems.length];
    return {
      answerId: `fixture-answer-${index}`,
      questionId: `fixture-question-${index}`,
      position: index + 1,
      userAnswer: index < 3 ? ["A", "C", "B"][index] : null,
      flagged: index === 1,
      confidence: null,
      question: {
        id: `fixture-question-${index}`,
        topic,
        question_text: text,
        option_a: a,
        option_b: b,
        option_c: c,
        option_d: d,
      },
    };
  });

const examSession = (): Out<typeof getExamSession> => ({
  session: {
    id: "fixture-exam-0",
    examType: "RN",
    category: "All Areas",
    status: "in_progress",
    startedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
    deadlineAt: new Date(Date.now() + 48 * 60_000).toISOString(),
    serverNow: new Date().toISOString(),
    timeLimitMinutes: 60,
    totalQuestions: 12,
  },
  items: sessionItems(12),
});

const examResults: Out<typeof getExamResults> = {
  exam: { score_pct: 66.7, correct_count: 8, total_questions: 12, exam_type: "RN" },
  items: Array.from({ length: 12 }, (_, index) => {
    const [topic, text, a, b, c, d] = stems[index % stems.length];
    const skipped = index === 5 || index === 9;
    const correct = !skipped && index % 3 !== 1;
    return {
      user_answer: skipped ? null : correct ? "A" : "B",
      is_correct: skipped ? null : correct,
      flagged: index === 4,
      position: index + 1,
      selection_reason: null,
      questions: {
        id: `fixture-question-${index}`,
        question_text: text,
        correct_answer: "A",
        rationale:
          "The first option is the safest and most direct action. The others delay care, add risk or do not address the cause.",
        topic,
        option_a: a,
        option_b: b,
        option_c: c,
        option_d: d,
      },
    };
  }),
};

const recommendation: Out<typeof getDailyRecommendation> = {
  date: new Date().toISOString().slice(0, 10),
  availableMinutes: 30,
  totalQuestions: 30,
  estimatedMinutes: 30,
  urgency: "none",
  daysToExam: 90,
  limitReached: false,
  blocks: [
    {
      kind: "topic_practice",
      title: "Antenatal care",
      questions: 15,
      reason: "Antenatal care is your weakest topic at 41% mastery.",
      topic: "Antenatal care",
      mastery: 41,
    },
    {
      kind: "mistake_review",
      title: "Review past mistakes",
      questions: 15,
      reason: "You missed these and have not got them right since.",
    },
  ],
  notes: [],
};

const streak: Out<typeof getStudyStreak> = {
  current: 6,
  longest: 11,
  studiedToday: false,
  atRisk: true,
  lastStudyDay: daysAgo(1).slice(0, 10),
  daysStudiedLast7: 5,
  daysStudiedLast30: 19,
  minQuestionsPerDay: 10,
  nextMilestone: { days: 7, remaining: 1 },
};

const gamification: Out<typeof getGamificationSummary> = {
  totalXp: 1340,
  level: { level: 5, totalXp: 1340, xpIntoLevel: 140, xpForNextLevel: 400, progress: 0.35 },
  achievements: [
    ["first_session", "First test", "Finish your first test.", 1, 1, true],
    ["sessions_10", "Ten tests", "Finish 10 tests.", 10, 4, false],
    ["streak_7", "A week in a row", "Study seven days in a row.", 7, 6, false],
  ].map(([code, title, description, target, current, unlocked]) => ({
    code: String(code),
    title: String(title),
    description: String(description),
    xp: 50,
    unlocked: Boolean(unlocked),
    current: Number(current),
    target: Number(target),
    progress: Number(current) / Number(target),
    unlockedAt: unlocked ? new Date() : null,
  })),
  recent: [],
};

const readiness: Out<typeof getExamReadiness> = {
  examType: "RN",
  readinessScore: 64,
  band: "developing",
  attempts: 176,
  attemptsToScore: 0,
  completeness: 0.8,
  components: {
    accuracy: { value: 0.66, weight: 0.3, used: true },
    mastery: { value: 0.61, weight: 0.3, used: true },
    speed: { value: 0.7, weight: 0.2, used: true },
    consistency: { value: 0.58, weight: 0.2, used: true },
    repeatedMistakes: { value: null, weight: 0.1, used: false },
    recent: { value: null, weight: 0.1, used: false },
    mockExam: { value: null, weight: 0.1, used: false },
    coverage: { value: 0.5, weight: 0.1, used: true },
  },
  accuracy: 66,
  mastery: 61,
  speed: 70,
  consistency: 58,
  weakTopics: [{ topic: "Antenatal care", mastery: 41, level: "weak" }],
  recommendations: [
    { component: "mastery", message: "Practise your weakest topics until their mastery improves." },
  ],
  exam: { date: null, daysToExam: 90, urgency: "none" },
  notice:
    "An internal preparation metric computed from your past practice. It is not a prediction of your exam result.",
  history: null,
};

const inDaysIso = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const studyPlan: Out<typeof getStudyPlan> = {
  examType: "RN",
  settings: { dailyMinutes: 30, daysPerWeek: 5, targetScore: 80 },
  createdAt: new Date(Date.now() - 10 * 86_400_000),
  plan: {
    startsOn: inDaysIso(-10),
    examDate: inDaysIso(90),
    questionsPerDay: 20,
    weeks: [0, 1, 2].map((index) => ({
      index,
      startsOn: inDaysIso(-10 + index * 7),
      endsOn: inDaysIso(-4 + index * 7),
      kind: "learn" as const,
      questionBudget: 100,
      items: [
        {
          weekIndex: index,
          kind: "topic" as const,
          topic: "Antenatal care",
          questions: 60,
          mastery: 41,
        },
        {
          weekIndex: index,
          kind: "topic" as const,
          topic: "Pharmacology",
          questions: 40,
          mastery: 63,
        },
      ],
    })),
    summary: {
      totalQuestions: 300,
      learnQuestions: 300,
      unallocatedQuestions: 0,
      unscheduledTopics: [],
    },
  },
  progress: {
    weeks: [0, 1, 2].map((index) => ({
      index,
      planned: 100,
      done: index === 0 ? 100 : index === 1 ? 46 : 0,
      items: [
        {
          kind: "topic" as const,
          topic: "Antenatal care",
          questions: 60,
          done: index === 0 ? 60 : index === 1 ? 30 : 0,
        },
        {
          kind: "topic" as const,
          topic: "Pharmacology",
          questions: 40,
          done: index === 0 ? 40 : index === 1 ? 16 : 0,
        },
      ],
    })),
    questionsDone: 146,
    plannedToDate: 160,
    currentWeek: 1,
    status: "behind",
  },
  examDateChanged: false,
  attention: "behind",
};

const challenge: Out<typeof getDailyChallenge> = {
  id: "fixture-challenge",
  date: inDaysIso(0),
  examType: "RN",
  totalQuestions: 10,
  status: "not_started",
  examId: null,
  result: null,
};

const performance: Out<typeof getPerformanceAnalysis> = {
  attempts: 176,
  sufficientEvidence: true,
  attemptsNeeded: 0,
  accuracy: 66.4,
  recent: { attempts: 60, accuracy: 71.7 },
  earlier: { attempts: 116, accuracy: 63.8 },
  topics: [],
  weakest: [
    {
      topic: "Antenatal care",
      attempts: 22,
      accuracy: 41,
      trend: "stable",
      recent: null,
      earlier: null,
    },
    {
      topic: "Pharmacology",
      attempts: 64,
      accuracy: 59,
      trend: "improving",
      recent: null,
      earlier: null,
    },
  ],
  strongest: [
    {
      topic: "Fundamentals of nursing",
      attempts: 90,
      accuracy: 82,
      trend: "stable",
      recent: null,
      earlier: null,
    },
  ],
  repeatedMistakes: { total: 0, questions: [] },
  revision: { revisited: 0, correctedNext: 0, rate: null },
  pace: null,
  reviews: { due: 4, unresolvedMistakes: 12 },
  unverifiedExams: 0,
  findings: [],
};

const confidence: Out<typeof getConfidenceAnalytics> = {
  overall: {
    rated: 80,
    correctHigh: 38,
    wrongHigh: 9,
    correctLow: 14,
    wrongLow: 19,
    correctMedium: 0,
    wrongMedium: 0,
    unrated: 0,
    highConfidenceErrorRate: 19.1,
    lowConfidenceSuccessRate: 42.4,
    falseConfidence: false,
    weakConfidence: false,
  },
  byTopic: [],
  byExamType: [],
  period: { since: null },
};

// Only the fields the pace card reads are given; the rest of the report is not shown anywhere yet.
const timing = {
  overall: { count: 120, averageMs: 64_000, medianMs: 58_000, minMs: 9_000, maxMs: 240_000 },
  insights: [],
} as unknown as Out<typeof getTimeAnalytics>;

// A computed summary, never dressed as AI: the harness has no model, so it shows the fallback state.
const insight: Out<typeof getAiInsight> = {
  kind: "readiness",
  source: "computed",
  status: "ai_unavailable",
  narrative: {
    summary: "Your readiness is 64, in the developing band, from 176 answered questions.",
    points: [{ topic: "Antenatal care", text: "Mastery is 41 out of 100, your lowest topic." }],
    nextAction: "Practise Antenatal care next.",
  },
  facts: ["176 answers recorded", "Readiness score 64 of 100"],
  generatedAt: null,
};

const questionOf = (index: number) => {
  const [topic, text, a, b, c, d] = stems[index % stems.length];
  return {
    id: `fixture-question-${index}`,
    topic,
    question_text: text,
    option_a: a,
    option_b: b,
    option_c: c,
    option_d: d,
    correct_answer: "A",
    rationale:
      "The first option is the safest and most direct action. The others delay care, add risk or do not address the cause.",
  };
};

const mistakes: Out<typeof listMistakes> = {
  items: [0, 1, 2].map((index) => ({
    questionId: `fixture-question-${index}`,
    examType: index === 2 ? ("RM" as const) : ("RN" as const),
    topic: stems[index][0],
    misses: 3 - index,
    attempts: 4,
    correct: index + 1,
    unresolved: index !== 1,
    lastAnswer: "B",
    lastMissedAt: daysAgo(index + 1),
    answerWithheld: false,
    question: questionOf(index),
  })),
  nextOffset: null,
};

const bookmarks: Out<typeof listBookmarks> = {
  items: [0, 1].map((index) => ({
    questionId: `fixture-question-${index}`,
    topic: stems[index][0],
    note: index === 0 ? "Check the hand hygiene steps again." : null,
    examType: "RN" as const,
    createdAt: daysAgo(index + 2),
    question: questionOf(index),
  })),
  nextOffset: null,
};

const notificationList: Out<typeof listNotifications> = {
  items: [
    {
      id: "fixture-notification-0",
      kind: "friend_request_received",
      message: "Ada sent you a friend request.",
      data: { friendshipId: "fixture-friendship-0", fromUsername: "Ada" },
      createdAt: new Date(Date.now() - 3_600_000),
      readAt: null,
    },
    {
      id: "fixture-notification-1",
      kind: "challenge_received",
      message: "Ada challenged you to a 10 question test.",
      data: { challengeId: "fixture-challenge-0", fromUsername: "Ada", totalQuestions: 10 },
      createdAt: new Date(Date.now() - 86_400_000),
      readAt: null,
    },
    {
      id: "fixture-notification-2",
      kind: "friend_request_accepted",
      message: "Chidi accepted your friend request.",
      data: { friendshipId: "fixture-friendship-1", username: "Chidi" },
      createdAt: new Date(Date.now() - 3 * 86_400_000),
      readAt: new Date(Date.now() - 2 * 86_400_000),
    },
  ],
  nextOffset: null,
};

const friendList = (kind: string): Out<typeof listFriends> => ({
  items:
    kind === "friends"
      ? [
          {
            friendshipId: "fixture-friendship-1",
            username: "Chidi",
            since: new Date(Date.now() - 5 * 86_400_000),
          },
          {
            friendshipId: "fixture-friendship-2",
            username: "Ngozi",
            since: new Date(Date.now() - 5 * 86_400_000),
          },
        ]
      : kind === "incoming"
        ? [
            {
              friendshipId: "fixture-friendship-3",
              username: "Ada",
              since: new Date(Date.now() - 5 * 86_400_000),
            },
          ]
        : [
            {
              friendshipId: "fixture-friendship-4",
              username: "Tunde",
              since: new Date(Date.now() - 5 * 86_400_000),
            },
          ],
  nextOffset: null,
});

const friendChallenges: Out<typeof listFriendChallenges> = {
  items: [
    {
      id: "fixture-challenge-1",
      role: "opponent",
      opponentUsername: "Ada",
      examType: "RN",
      totalQuestions: 10,
      examId: null,
      createdAt: new Date(Date.now() - 86_400_000),
      expiresAt: new Date(Date.now() + 86_400_000),
      state: { status: "not_started" },
    },
    {
      id: "fixture-challenge-2",
      role: "challenger",
      opponentUsername: "Chidi",
      examType: "RM",
      totalQuestions: 20,
      examId: "fixture-exam-0",
      createdAt: new Date(Date.now() - 3 * 86_400_000),
      expiresAt: new Date(Date.now() + 86_400_000),
      state: {
        status: "completed",
        winner: "you",
        you: { correct: 15, scorePct: 75 },
        opponent: { correct: 12, scorePct: 60 },
      },
    },
  ],
  nextOffset: null,
};

const leaderboard: Out<typeof getLeaderboard> = {
  period: "daily",
  entries: [
    ["Nurse Ada", 88.4, 160, 141],
    ["Nurse Chidi", 81.2, 210, 170],
    ["Nurse Test", 66.4, 176, 117],
    ["Nurse Ngozi", 61.9, 120, 74],
  ].map(([username, avgScore, attempted, correct], index) => ({
    rank: index + 1,
    username: String(username),
    avgScore: Number(avgScore),
    attempted: Number(attempted),
    correct: Number(correct),
    isYou: index === 2,
    activeDays: null,
  })),
};

type SharedVariant = "live" | "upcoming" | "closed" | "running" | "result";
/** sha256 of the harness's link token "fixture-token": the key the page stores a resumable attempt under. */
export const FIXTURE_TOKEN_HASH =
  "d07f963c2bb7a3cc74a910e51ca0075b194da412a93737881f105a55156a988f";

const sharedInfo = {
  title: "Practice set for the class",
  description: "A short set from your tutor.",
  examType: "RN" as const,
  durationMinutes: 20,
  questionCount: 4,
};
const sharedTest = (variant: SharedVariant): Out<typeof getSharedTest> => {
  const now = new Date().toISOString();
  if (variant === "closed")
    return {
      state: "closed",
      serverNow: now,
      test: { ...sharedInfo, startsAt: inDaysIso(-3), expiresAt: inDaysIso(-1) },
    };
  if (variant === "upcoming")
    return {
      state: "upcoming",
      serverNow: now,
      test: {
        ...sharedInfo,
        startsAt: new Date(Date.now() + 26 * 3_600_000 + 5 * 60_000).toISOString(),
        expiresAt: inDaysIso(3),
      },
    };
  return {
    state: "live",
    serverNow: now,
    test: { ...sharedInfo, startsAt: inDaysIso(-1), expiresAt: inDaysIso(7) },
  };
};

const sharedQuestions = Array.from({ length: 4 }, (_, index) => {
  const question = questionOf(index);
  return {
    id: question.id,
    position: index,
    question_text: question.question_text,
    option_a: question.option_a,
    option_b: question.option_b,
    option_c: question.option_c,
    option_d: question.option_d,
    answer: index === 0 ? "A" : index === 2 ? "C" : null,
    flagged: index === 1,
  };
});

const sharedResult: Out<typeof submitSharedTest> = {
  score: 50,
  correct: 2,
  total: 4,
  results: Array.from({ length: 4 }, (_, index) => {
    const question = questionOf(index);
    return {
      question_id: question.id,
      question_position: index + 1,
      question_text: question.question_text,
      option_a: question.option_a,
      option_b: question.option_b,
      option_c: question.option_c,
      option_d: question.option_d,
      correct_answer: "A",
      rationale: question.rationale,
      user_answer: index < 2 ? "A" : index === 2 ? "B" : null,
      is_correct: index < 2,
    };
  }),
};

const sharedAttempt = (variant: SharedVariant): Out<typeof getSharedAttempt> => ({
  status: variant === "result" ? "completed" : "in_progress",
  serverNow: new Date().toISOString(),
  startedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
  deadlineAt: new Date(Date.now() + 18 * 60_000).toISOString(),
  test: { ...sharedInfo, durationMinutes: 20 },
  email: "student@ng-visual-fixture.example",
  linked: false,
  questions: variant === "result" ? [] : sharedQuestions,
  result: variant === "result" ? sharedResult : null,
});

const sharedStart: Out<typeof startSharedTest> = {
  attemptId: "fixture-attempt",
  attempt: sharedAttempt("running"),
};

const notifications: Out<typeof getUnreadNotificationCount> = { unread: 3 };

const publicPlans: Out<typeof listPublicPlans> = [
  { name: "Erudite", priceNgn: 3000, durationDays: 30 },
  { name: "Scholar", priceNgn: 7500, durationDays: 90 },
];

const similarEntries: ReadonlyArray<{
  reasons: Out<typeof getSimilarQuestions>["items"][number]["reasons"];
  attempted: boolean;
}> = [
  { reasons: ["same_topic", "same_difficulty"], attempted: false },
  { reasons: ["same_topic", "shared_tags"], attempted: true },
  { reasons: ["similar_wording"], attempted: false },
];

const similar: Out<typeof getSimilarQuestions> = {
  source: { id: "fixture-question-0", topic: stems[0][0], subtopicId: null, difficulty: null },
  items: similarEntries.map((entry, index) => {
    const full = questionOf(index + 3);
    return {
      id: `fixture-similar-${index}`,
      topic: full.topic,
      subtopicId: null,
      difficulty: null,
      tags: [],
      year: null,
      score: 0.8 - index * 0.1,
      reasons: entry.reasons,
      attempted: entry.attempted,
      question: {
        question_text: full.question_text,
        option_a: full.option_a,
        option_b: full.option_b,
        option_c: full.option_c,
        option_d: full.option_d,
      },
    };
  }),
};

export function fixturesFor(state: FixtureState, variant: SharedVariant = "live"): FixtureMap {
  if (state === "empty") {
    return {
      getTopicCounts: {} satisfies Out<typeof getTopicCounts>,
      getExamResults: {
        exam: { score_pct: null, correct_count: null, total_questions: 0, exam_type: "RN" },
        items: [],
      } satisfies Out<typeof getExamResults>,
      listExamHistory: {
        exams: [],
        verifiedCount: 0,
        unverifiedCount: 0,
        averageScorePct: null,
      } satisfies Out<typeof listExamHistory>,
      getTopicMastery: {
        topics: [],
        overall: { score: 50, level: "insufficient_data", evidence: 0, attempts: 0 },
      } satisfies Out<typeof getTopicMastery>,
      getUnreadNotificationCount: { unread: 0 } satisfies Out<typeof getUnreadNotificationCount>,
    };
  }
  return {
    getDailyRecommendation: recommendation,
    getStudyStreak: streak,
    getGamificationSummary: gamification,
    getExamReadiness: readiness,
    listFriends: (input: unknown) =>
      friendList((input as { kind?: string } | undefined)?.kind ?? "friends"),
    listFriendChallenges: friendChallenges,
    getLeaderboard: leaderboard,
    getSharedTest: sharedTest(variant),
    getSharedAttempt: sharedAttempt(variant),
    startSharedTest: sharedStart,
    submitSharedTest: sharedResult,
    listMistakes: mistakes,
    listBookmarks: bookmarks,
    listNotifications: notificationList,
    getAiInsight: insight,
    getStudyPlan: studyPlan,
    getDailyChallenge: challenge,
    getPerformanceAnalysis: performance,
    getConfidenceAnalytics: confidence,
    getTimeAnalytics: timing,
    getTopicCounts: topicCounts,
    getExamSession: examSession,
    getExamResults: examResults,
    listExamHistory: history,
    getTopicMastery: mastery,
    getUnreadNotificationCount: notifications,
    listPublicPlans: publicPlans,
    getSimilarQuestions: similar,
    ...adminFixtures,
  };
}
