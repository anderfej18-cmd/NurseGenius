// Wording for the progress screens. Pure functions, so the screens stay humble and the words are
// tested. The inputs are strings or plain shapes from server responses, never server types.

const MASTERY: Record<string, string> = {
  insufficient_data: "Not enough data yet",
  weak: "Weak",
  developing: "Developing",
  proficient: "Proficient",
  mastered: "Mastered",
};

const READINESS: Record<string, string> = {
  not_enough_data: "Not enough data yet",
  early: "Early days",
  developing: "Developing",
  solid: "Solid",
  strong: "Strong",
};

const PLAN_STATUS: Record<string, string> = {
  not_started: "Not started",
  behind: "Behind plan",
  on_track: "On track",
  ahead: "Ahead of plan",
  finished: "Finished",
};

const TREND: Record<string, string> = {
  improving: "Improving",
  declining: "Declining",
  stable: "Steady",
  unknown: "Not enough recent answers",
};

export const trendText = (trend: string): string => TREND[trend] ?? trend;
export const masteryLevelText = (level: string): string => MASTERY[level] ?? level;
export const readinessBandText = (band: string): string => READINESS[band] ?? band;
export const studyPlanStatusText = (status: string): string => PLAN_STATUS[status] ?? status;

interface StreakFacts {
  readonly current: number;
  readonly studiedToday: boolean;
  readonly atRisk: boolean;
  readonly minQuestionsPerDay: number;
  readonly nextMilestone: { readonly days: number; readonly remaining: number } | null;
}

export function streakMessage(streak: StreakFacts): string {
  const need = `Answer ${streak.minQuestionsPerDay} questions today`;
  if (streak.current === 0) return `No streak yet. ${need} to start one.`;
  const base = `${streak.current}-day streak`;
  const status = streak.studiedToday ? `${base}, kept for today.` : `${base}. ${need} to keep it.`;
  const milestone = streak.nextMilestone;
  if (milestone === null || !streak.studiedToday) return status;
  const days = milestone.remaining === 1 ? "1 more day" : `${milestone.remaining} more days`;
  return `${status} ${days} to reach ${milestone.days}.`;
}

export type ChallengeActionKind = "start" | "continue" | "result";

export function challengeAction(state: { status: string; examId: string | null }): {
  label: string;
  kind: ChallengeActionKind;
} {
  if (state.status === "completed") return { label: "See my result", kind: "result" };
  if (state.status === "in_progress")
    return { label: "Continue today's challenge", kind: "continue" };
  return { label: "Start today's challenge", kind: "start" };
}

export function examCountdown(daysToExam: number | null): string {
  if (daysToExam === null) return "No exam date set.";
  if (daysToExam < 0) return "Your exam date has passed.";
  if (daysToExam === 0) return "Your exam is today.";
  if (daysToExam === 1) return "Your exam is tomorrow.";
  return `Your exam is in ${daysToExam} days.`;
}

interface PlanItemFacts {
  readonly kind: "topic" | "review" | "mock_exam";
  readonly topic: string | null;
  readonly mastery: number | null;
}

export const planItemLabel = (item: PlanItemFacts): string =>
  item.kind === "mock_exam" ? "Mock exam" : (item.topic ?? "Topic");

/** Why a topic is in the plan, from the mastery the student had when it was made. No figure is invented. */
export function planItemReason(item: PlanItemFacts, target: number): string {
  const topic = item.topic ?? "this topic";
  if (item.kind === "mock_exam") return "A timed mock exam to practise under exam conditions.";
  if (item.kind === "review") {
    return item.mastery === null
      ? `Final-week review of ${topic}.`
      : `Final-week review: ${topic} is at ${item.mastery}% mastery, one of your furthest from the target.`;
  }
  if (item.mastery === null) {
    return `You have not practised ${topic} yet, so this builds a first measure of it.`;
  }
  return item.mastery < target
    ? `${topic} is at ${item.mastery}% mastery against your target of ${target}%.`
    : `${topic} is at ${item.mastery}% mastery, above your target of ${target}%; practice keeps it there.`;
}

export function planAttentionText(attention: string | null): string | null {
  if (attention === "exam_date_changed") {
    return "Your exam date has changed since this plan was made. Update the plan to match it.";
  }
  if (attention === "behind") {
    return "You are behind this plan. Updating it plans the remaining weeks from where you are now.";
  }
  return null;
}

/** The exam-start link settings for one block of the day's plan. */
export function planBlockSearch(block: { kind: string; topic?: string }): {
  topic?: string;
  selection: "due" | "mistakes" | "adaptive";
} {
  if (block.kind === "due_reviews") return { selection: "due" };
  if (block.kind === "mistake_review") return { selection: "mistakes" };
  return {
    ...(block.kind === "topic_practice" && block.topic !== undefined ? { topic: block.topic } : {}),
    selection: "adaptive",
  };
}

interface RankedTopic {
  readonly topic: string;
  readonly score: number;
  readonly level: string;
}

/**
 * The topics to celebrate and the ones to work on, from the levels the server's mastery engine
 * decided. A topic with too little evidence is in neither list.
 */
export function strongestAndWeakest<T extends RankedTopic>(
  topics: readonly T[],
  count = 3,
): { strongest: T[]; weakest: T[] } {
  const strongest = topics
    .filter((t) => t.level === "proficient" || t.level === "mastered")
    .sort((a, b) => b.score - a.score || a.topic.localeCompare(b.topic))
    .slice(0, count);
  const weakest = topics
    .filter((t) => t.level === "weak" || t.level === "developing")
    .sort((a, b) => a.score - b.score || a.topic.localeCompare(b.topic))
    .slice(0, count);
  return { strongest, weakest };
}
