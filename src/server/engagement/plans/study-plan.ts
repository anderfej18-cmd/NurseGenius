import { ValidationError } from "@/lib/app-errors";
import { allocate } from "../../intelligence/allocate";
import { clamp } from "../../intelligence/statistics";
import { daysBetweenUtc } from "../../intelligence/utc-days";
import { STUDY_PLAN_CONFIG, type StudyPlanConfig } from "./study-plan.config";

/** A topic that exists in the question bank, with what the student has shown in it. */
export interface PlanTopic {
  readonly topic: string;
  /** Active questions in the bank for this topic. */
  readonly questionCount: number;
  /** Mastery 0 to 100; null if the student has not practised the topic. */
  readonly mastery: number | null;
}

export interface PlanInput {
  /** Today and the exam date, as YYYY-MM-DD (UTC). */
  readonly today: string;
  readonly examDate: string;
  readonly dailyMinutes: number;
  readonly daysPerWeek: number;
  readonly targetScore: number;
  /** The student's own average seconds per question, if known. */
  readonly secondsPerQuestion: number | null;
  readonly topics: readonly PlanTopic[];
}

export type PlanItemKind = "topic" | "review" | "mock_exam";

export interface PlanItem {
  readonly weekIndex: number;
  readonly kind: PlanItemKind;
  /** Null for a mock exam, which covers every topic. */
  readonly topic: string | null;
  readonly questions: number;
  /** The mastery the student had in the topic when the plan was made; null if never practised or a mock exam. */
  readonly mastery: number | null;
}

export interface PlanWeek {
  readonly index: number;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly kind: "learn" | "final";
  /** The most questions the week's study time allows. */
  readonly questionBudget: number;
  readonly items: readonly PlanItem[];
}

export interface StudyPlanDraft {
  readonly startsOn: string;
  readonly examDate: string;
  readonly questionsPerDay: number;
  readonly weeks: readonly PlanWeek[];
  readonly summary: {
    readonly totalQuestions: number;
    /** Questions planned for topics before the final week. */
    readonly learnQuestions: number;
    /** Learn-week capacity that no topic could use (every topic was already at its pass limit). */
    readonly unallocatedQuestions: number;
    /** Topics the available time did not reach. */
    readonly unscheduledTopics: readonly string[];
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
const asDate = (date: string): Date => new Date(`${date}T00:00:00.000Z`);

/**
 * A deterministic week-by-week plan from today to the day before the exam, using only topics that
 * exist in the bank. Pure: the same input and config give the same plan. Rules in docs/formulas.md
 * (section 13).
 */
export function generateStudyPlan(
  input: PlanInput,
  config: StudyPlanConfig = STUDY_PLAN_CONFIG,
): StudyPlanDraft {
  const totalDays = checkInput(input, config);
  const secondsPerQuestion = clamp(
    input.secondsPerQuestion ?? config.seconds.default,
    config.seconds.min,
    config.seconds.max,
  );
  const questionsPerDay = Math.max(1, Math.floor((input.dailyMinutes * 60) / secondsPerQuestion));
  const weeks = calendar(input, totalDays, questionsPerDay);

  const ranked = rankTopics(input.topics, input.targetScore, config);
  const learnWeeks = weeks.slice(0, -1);
  const finalWeek = weeks[weeks.length - 1];
  const learn = scheduleLearnWeeks(learnWeeks, ranked, config);
  const final = scheduleFinalWeek(finalWeek, ranked, input.targetScore, config);

  const planned = [...learn.weeks, final];
  return {
    startsOn: input.today,
    examDate: input.examDate,
    questionsPerDay,
    weeks: planned,
    summary: {
      totalQuestions: planned
        .flatMap((week) => week.items)
        .reduce((sum, i) => sum + i.questions, 0),
      learnQuestions: learn.planned,
      unallocatedQuestions: learn.unallocated,
      unscheduledTopics: learn.unscheduled,
    },
  };
}

/** Throws for input no plan can be made from; returns the number of days to plan. */
function checkInput(input: PlanInput, config: StudyPlanConfig): number {
  const within = (value: number, range: { min: number; max: number }) =>
    Number.isInteger(value) && value >= range.min && value <= range.max;
  if (!within(input.dailyMinutes, config.dailyMinutes)) {
    throw new ValidationError(
      `Study time must be between ${config.dailyMinutes.min} and ${config.dailyMinutes.max} minutes a day.`,
    );
  }
  if (!within(input.daysPerWeek, config.daysPerWeek)) {
    throw new ValidationError(
      `Study days must be between ${config.daysPerWeek.min} and ${config.daysPerWeek.max} a week.`,
    );
  }
  if (!within(input.targetScore, config.targetScore)) {
    throw new ValidationError(
      `The target score must be between ${config.targetScore.min} and ${config.targetScore.max}.`,
    );
  }
  if (input.topics.length === 0) {
    throw new ValidationError("There are no questions to plan from yet.");
  }

  const totalDays = daysBetweenUtc(asDate(input.today), asDate(input.examDate));
  if (totalDays < 1) throw new ValidationError("Set an exam date in the future to make a plan.");
  if (totalDays > config.maxWeeks * 7) {
    throw new ValidationError(
      `Study plans cover up to ${config.maxWeeks} weeks. Come back closer to your exam.`,
    );
  }
  return totalDays;
}

interface Slot {
  readonly index: number;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly kind: "learn" | "final";
  readonly questionBudget: number;
}

/** Whole weeks from today; the last runs to the day before the exam. */
function calendar(input: PlanInput, totalDays: number, questionsPerDay: number): Slot[] {
  const count = Math.ceil(totalDays / 7);
  return Array.from({ length: count }, (_, index) => {
    const startsOn = addDays(input.today, index * 7);
    const days = Math.min(7, totalDays - index * 7);
    const studyDays = Math.min(input.daysPerWeek, days);
    return {
      index,
      startsOn,
      endsOn: addDays(startsOn, days - 1),
      kind: index === count - 1 ? "final" : "learn",
      questionBudget: questionsPerDay * studyDays,
    };
  });
}

interface RankedTopic {
  readonly topic: string;
  readonly questionCount: number;
  readonly mastery: number;
  /** The student's real mastery, null when the topic has not been practised (`mastery` then assumes the unseen value). */
  readonly measured: number | null;
  readonly weight: number;
}

/** Highest weight first (the topics furthest below the target); ties by name. */
function rankTopics(
  topics: readonly PlanTopic[],
  target: number,
  config: StudyPlanConfig,
): RankedTopic[] {
  return topics
    .map((entry) => {
      const mastery = entry.mastery ?? config.unseenMastery;
      return {
        topic: entry.topic,
        questionCount: entry.questionCount,
        mastery,
        measured: entry.mastery,
        weight: config.baseWeight + Math.max(0, target - mastery) / 100,
      };
    })
    .sort((a, b) => b.weight - a.weight || a.topic.localeCompare(b.topic));
}

/**
 * Shares the learn weeks' questions among the topics by weight (each capped at its pass limit), then
 * lays the topics end to end in rank order and cuts that line into weeks, so the weakest topics come
 * first and a topic may run over from one week into the next.
 */
function scheduleLearnWeeks(
  slots: readonly Slot[],
  ranked: readonly RankedTopic[],
  config: StudyPlanConfig,
): { weeks: PlanWeek[]; planned: number; unallocated: number; unscheduled: string[] } {
  const capacity = slots.reduce((sum, slot) => sum + slot.questionBudget, 0);
  const shares = allocate(
    capacity,
    ranked.map((entry) => entry.weight),
  );
  const totals = ranked.map((entry, i) =>
    Math.min(shares[i], entry.questionCount * config.maxPassesPerTopic),
  );

  // The line of topics, consumed week by week.
  const remaining = ranked.map((entry, i) => ({
    topic: entry.topic,
    measured: entry.measured,
    left: totals[i],
  }));
  let position = 0;
  const weeks = slots.map((slot): PlanWeek => {
    const items: PlanItem[] = [];
    let room = slot.questionBudget;
    while (room > 0 && position < remaining.length) {
      const current = remaining[position];
      const take = Math.min(room, current.left);
      if (take > 0)
        items.push({
          weekIndex: slot.index,
          kind: "topic",
          topic: current.topic,
          questions: take,
          mastery: current.measured,
        });
      current.left -= take;
      room -= take;
      if (current.left === 0) position += 1;
    }
    return { ...slot, items };
  });

  const planned = totals.reduce((sum, total) => sum + total, 0);
  return {
    weeks,
    planned,
    unallocated: capacity - planned,
    unscheduled: ranked.filter((_, i) => totals[i] === 0).map((entry) => entry.topic),
  };
}

/** The last week: review of the topics furthest from the target, then a mock exam with the rest. */
function scheduleFinalWeek(
  slot: Slot,
  ranked: readonly RankedTopic[],
  target: number,
  config: StudyPlanConfig,
): PlanWeek {
  const { reviewShare, reviewTopics, mockMaxQuestions } = config.finalWeek;
  const lowest = [...ranked].sort(
    (a, b) => a.mastery - b.mastery || a.topic.localeCompare(b.topic),
  );
  const below = lowest.filter((entry) => entry.mastery < target);
  const reviewed = (below.length > 0 ? below : lowest).slice(0, reviewTopics);

  const reviewBudget = Math.floor(slot.questionBudget * reviewShare);
  const shares = allocate(
    reviewBudget,
    reviewed.map((entry) => entry.weight),
  );
  const items = reviewed.flatMap((entry, i): PlanItem[] =>
    shares[i] > 0
      ? [
          {
            weekIndex: slot.index,
            kind: "review",
            topic: entry.topic,
            questions: shares[i],
            mastery: entry.measured,
          },
        ]
      : [],
  );

  const mock = Math.min(mockMaxQuestions, slot.questionBudget - sum(shares));
  if (mock > 0)
    items.push({
      weekIndex: slot.index,
      kind: "mock_exam",
      topic: null,
      questions: mock,
      mastery: null,
    });
  return { ...slot, items };
}

const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);
