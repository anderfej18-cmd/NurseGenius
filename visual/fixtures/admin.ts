// Typed fixtures for the admin tabs' server functions. Synthetic; they live only in the harness.
import type { listCustomTests } from "@/functions/custom-tests.functions";
import type { adminListQuestions, adminListSubtopics } from "@/functions/questions.functions";
import type { adminListQuestionReports } from "@/functions/reports.functions";
import type { getUserDirectory } from "@/functions/user-directory.functions";
import type { FixtureMap } from "./runtime";

type Out<F> = F extends (...args: never[]) => Promise<infer R> ? R : never;

const daysFrom = (days: number): string => new Date(Date.now() + days * 86_400_000).toISOString();

const base = {
  exam_type: "RN" as const,
  topic: "Fundamentals of nursing",
  subtopic_id: null,
  year: null,
  difficulty: null,
  tags: [],
  source: null,
  updated_at: daysFrom(-3),
  rationale: "Hand hygiene is the single most effective way to stop cross-infection.",
};

const bankQuestions: Out<typeof adminListQuestions> = {
  items: [
    {
      ...base,
      id: "00000000-0000-4000-8000-000000000001",
      status: "active",
      difficulty: "easy",
      tags: ["infection control"],
      question_text: "Which action best prevents the spread of infection between patients?",
      option_a: "Hand hygiene before and after contact",
      option_b: "Wearing gloves for all tasks",
      option_c: "Isolating every patient",
      option_d: "Using the same stethoscope",
      correct_answer: "A",
    },
    {
      ...base,
      id: "00000000-0000-4000-8000-000000000002",
      status: "active",
      topic: "Pharmacology",
      question_text: "34.",
      option_a: "Confirm the patient's identity",
      option_b: "",
      option_c: "Ask the family",
      option_d: "Prepare the dose",
      correct_answer: "E",
    },
    {
      ...base,
      id: "00000000-0000-4000-8000-000000000003",
      status: "retired",
      topic: "Medical-surgical nursing",
      question_text:
        "A patient two days after surgery has a rising temperature and a red, warm wound. What should the nurse do first?",
      option_a: "Assess the wound and report findings",
      option_b: "Apply a heat pack",
      option_c: "Encourage a larger meal",
      option_d: "Wait until the morning review",
      correct_answer: "A",
    },
  ],
  nextCursor: null,
};

const subtopics: Out<typeof adminListSubtopics> = [
  {
    id: "00000000-0000-4000-8000-0000000000a1",
    examType: "RN",
    topic: "Fundamentals of nursing",
    name: "Infection control",
  },
  {
    id: "00000000-0000-4000-8000-0000000000a2",
    examType: "RN",
    topic: "Fundamentals of nursing",
    name: "Vital signs",
  },
];

const reports: Out<typeof adminListQuestionReports> = {
  items: [
    {
      id: "00000000-0000-4000-8000-0000000000b1",
      reason: "incorrect_answer",
      details: "I think option B is also correct for adults over 65.",
      status: "open",
      createdAt: daysFrom(-1),
      resolutionNote: null,
      reporterId: "00000000-0000-4000-8000-0000000000d1",
      questionId: "00000000-0000-4000-8000-000000000001",
      resolvedAt: null,
      question: bankQuestions.items[0],
    },
  ],
  nextOffset: null,
};

const customTests: Out<typeof listCustomTests> = [
  {
    id: "00000000-0000-4000-8000-0000000000c1",
    title: "Maternal health review",
    description: "Thirty questions on antenatal and postnatal care.",
    exam_type: "RM",
    source_mode: "existing",
    duration_minutes: 45,
    owner_id: "00000000-0000-4000-8000-0000000000e1",
    owner_username: "Nurse Test",
    starts_at: daysFrom(-1),
    expires_at: daysFrom(6),
    share_token: "fixture-share-token-live",
    state: "live" as const,
    custom_unimported: 0,
    status: "published",
    question_count: 30,
    created_at: daysFrom(-8),
    participant_count: 3,
    pass_count: 2,
    average_score: 61.1,
    analytics: {
      participant_count: 3,
      pass_count: 2,
      fail_count: 1,
      pass_pct: 66.67,
      average_score: 61.1,
    },
    attempts: [
      {
        id: "a1",
        custom_test_id: "00000000-0000-4000-8000-0000000000c1",
        email: "candidate.one@example.com",
        score_pct: 80,
        correct_count: 24,
        total_questions: 30,
        completed_at: daysFrom(-1),
      },
      {
        id: "a2",
        custom_test_id: "00000000-0000-4000-8000-0000000000c1",
        email: "candidate.two@example.com",
        score_pct: 63.3,
        correct_count: 19,
        total_questions: 30,
        completed_at: daysFrom(-1),
      },
      {
        id: "a3",
        custom_test_id: "00000000-0000-4000-8000-0000000000c1",
        email: "candidate.three.with.a.long.address@example.com",
        score_pct: 40,
        correct_count: 12,
        total_questions: 30,
        completed_at: daysFrom(-2),
      },
    ],
  },
  {
    id: "00000000-0000-4000-8000-0000000000c2",
    title: "Pharmacology quick check",
    description: null,
    exam_type: "RN",
    source_mode: "upload",
    duration_minutes: 20,
    owner_id: "00000000-0000-4000-8000-0000000000e2",
    owner_username: null,
    starts_at: daysFrom(-8),
    expires_at: daysFrom(-4),
    share_token: "fixture-share-token-closed",
    state: "closed" as const,
    custom_unimported: 12,
    status: "published",
    question_count: 12,
    created_at: daysFrom(-20),
    participant_count: 0,
    pass_count: 0,
    average_score: 0,
    analytics: {
      participant_count: 0,
      pass_count: 0,
      fail_count: 0,
      pass_pct: 0,
      average_score: 0,
    },
    attempts: [],
  },
];

const directory: Out<typeof getUserDirectory> = {
  users: [
    { username: "Ada Obi", tier: "novice" },
    { username: "Chinwe N.", tier: "novice" },
    { username: "Tunde Bakare", tier: "erudite" },
    { username: null, tier: "scholar" },
  ],
  totals: { all: 4, novice: 2, erudite: 1, scholar: 1 },
  nextOffset: null,
};

export const adminFixtures: FixtureMap = {
  // Each exam type has its own questions (real ids never repeat across RN and RM).
  adminListQuestions: (input: unknown): Out<typeof adminListQuestions> =>
    (input as { examType?: string } | undefined)?.examType === "RM"
      ? { items: [], nextCursor: null }
      : bankQuestions,
  adminListSubtopics: subtopics,
  adminListQuestionReports: reports,
  listCustomTests: customTests,
  getUserDirectory: directory,
};
