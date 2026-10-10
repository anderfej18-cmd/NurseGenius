import type { TopicMastery } from "../mastery/mastery.service";
import { allocate } from "../allocate";
import { type ExamUrgency, examUrgency } from "../exam-urgency";
import { clamp } from "../statistics";
import { RECOMMENDATION_CONFIG, type RecommendationConfig } from "./recommendation.config";
import type {
  DailyPlan,
  PlanBlock,
  RecommendationInput,
  RecommendationStrategy,
} from "./recommendation.types";

/**
 * The daily plan from fixed rules over measured facts: weak topics, unresolved mistakes, due
 * reviews, pace and the exam date. Pure and explainable: every block states why it is there.
 * Rules in docs/formulas.md (section 8).
 */
export class DeterministicRecommendationStrategy implements RecommendationStrategy {
  constructor(private readonly config: RecommendationConfig = RECOMMENDATION_CONFIG) {}

  recommend(input: RecommendationInput): DailyPlan {
    const { config } = this;
    const urgency = examUrgency(input.exam.daysToExam, this.config.urgencyDays);
    const secondsPerQuestion = clamp(
      input.pace.averageSecondsPerQuestion ?? config.seconds.default,
      config.seconds.min,
      config.seconds.max,
    );
    const wanted = clamp(
      Math.floor((input.availableMinutes * 60) / secondsPerQuestion),
      config.questions.min,
      config.questions.max,
    );
    const budget = input.remainingToday === null ? wanted : Math.min(wanted, input.remainingToday);

    const base = {
      date: input.now.toISOString().slice(0, 10),
      availableMinutes: input.availableMinutes,
      urgency,
      daysToExam: input.exam.daysToExam,
    };
    if (budget <= 0) {
      return {
        ...base,
        totalQuestions: 0,
        estimatedMinutes: 0,
        limitReached: true,
        blocks: [],
        notes: ["Today's question limit has been reached; come back tomorrow."],
      };
    }

    const blocks = this.blocks(input, budget, urgency);
    const totalQuestions = blocks.reduce((sum, block) => sum + block.questions, 0);
    return {
      ...base,
      totalQuestions,
      estimatedMinutes: Math.ceil((totalQuestions * secondsPerQuestion) / 60),
      limitReached: false,
      blocks,
      notes: this.notes(input, urgency),
    };
  }

  private blocks(input: RecommendationInput, budget: number, urgency: ExamUrgency): PlanBlock[] {
    const { config } = this;
    // Topic practice is guaranteed its share; the other blocks draw on the rest in priority order.
    let otherBudget = budget - Math.ceil(budget * config.minTopicShare);
    const size = (target: number, available: number): number => {
      const wanted = Math.min(
        available,
        Math.max(Math.round(target), config.minBlockQuestions),
        otherBudget,
      );
      return wanted < Math.min(config.minBlockQuestions, available) ? 0 : wanted;
    };

    const due = size(budget * config.shares.dueReviews, input.dueReviews);
    otherBudget -= due;
    const mistakes = size(budget * config.shares.mistakeReview, input.unresolvedMistakes);
    otherBudget -= mistakes;
    const speed = input.pace.slowButAccurate
      ? size(budget * config.shares.speedPractice, Number.POSITIVE_INFINITY)
      : 0;

    const before: PlanBlock[] = [];
    if (due > 0) {
      before.push({
        kind: "due_reviews",
        title: "Due reviews",
        questions: due,
        reason: `${input.dueReviews} questions are due for review; reviewing them now keeps them from being forgotten.`,
      });
    }
    if (mistakes > 0) {
      before.push({
        kind: "mistake_review",
        title: "Mistake review",
        questions: mistakes,
        reason: `${input.unresolvedMistakes} questions you missed have not been answered correctly since.`,
      });
    }

    const after: PlanBlock[] =
      speed > 0
        ? [
            {
              kind: "speed_practice",
              title: "Speed practice",
              questions: speed,
              reason: "You answer correctly but slowly: practise at exam pace.",
            },
          ]
        : [];

    const topicBudget = budget - due - mistakes - speed;
    return [...before, ...this.topicBlocks(input.topics, topicBudget, urgency), ...after];
  }

  private topicBlocks(
    topics: readonly TopicMastery[],
    budget: number,
    urgency: ExamUrgency,
  ): PlanBlock[] {
    if (budget <= 0) return [];
    const ranked = this.rankTopics(topics);
    if (ranked.length === 0) {
      return [
        {
          kind: "mixed_practice",
          title: "Mixed practice",
          questions: budget,
          reason: "You have no practice history yet: start with a mix of topics.",
        },
      ];
    }

    const wanted =
      urgency === "high" ? this.config.topicBlocks.highUrgency : this.config.topicBlocks.default;
    const count = Math.max(
      1,
      Math.min(wanted, ranked.length, Math.floor(budget / this.config.minBlockQuestions)),
    );
    const chosen = ranked.slice(0, count);
    // Every chosen topic gets the minimum first; the rest is shared by weakness.
    const base = Math.min(budget, this.config.minBlockQuestions);
    const sizes = allocate(
      budget - count * base,
      chosen.map((entry) => entry.priority),
    ).map((share) => base + share);

    return chosen.map(
      ({ topic }, index): PlanBlock => ({
        kind: "topic_practice",
        title: topic.topic,
        topic: topic.topic,
        mastery: topic.score,
        questions: sizes[index],
        reason:
          index === 0
            ? `${topic.topic} is your weakest topic (mastery ${topic.score}%).`
            : `${topic.topic} is next (mastery ${topic.score}%).`,
      }),
    );
  }

  /** Weakest first: 1 − mastery, plus a bonus while the topic's recent accuracy is falling. */
  private rankTopics(
    topics: readonly TopicMastery[],
  ): Array<{ topic: TopicMastery; priority: number }> {
    const open = topics.filter((topic) => topic.level !== "mastered");
    const candidates = open.length > 0 ? open : topics;
    return candidates
      .map((topic) => ({
        topic,
        priority:
          1 - topic.score / 100 + (topic.trend === "declining" ? this.config.decliningBonus : 0),
      }))
      .sort((a, b) => b.priority - a.priority || a.topic.topic.localeCompare(b.topic.topic));
  }

  private notes(input: RecommendationInput, urgency: ExamUrgency): string[] {
    const notes: string[] = [];
    const { daysToExam } = input.exam;
    if (urgency !== "none" && daysToExam !== null)
      notes.push(`Your exam is in ${daysToExam} days.`);
    const { daysSinceLastStudy } = input.activity;
    if (daysSinceLastStudy !== null && daysSinceLastStudy >= this.config.returnAfterDays) {
      notes.push(`You have not practised for ${daysSinceLastStudy} days: start with the reviews.`);
    }
    return notes;
  }
}
