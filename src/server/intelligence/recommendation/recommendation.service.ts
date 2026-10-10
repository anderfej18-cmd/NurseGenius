import { NotFoundError, ValidationError } from "@/lib/app-errors";
import { remainingToday } from "../../sessions/quota";
import type { Quota } from "../../sessions/session.types";
import type { AttemptSignal } from "../attempt.types";
import type { MasteryService } from "../mastery/mastery.service";
import type { TimeAnalyticsService } from "../time/time-analytics.service";
import { daysBetweenUtc, daysUntilDate } from "../utc-days";
import { RECOMMENDATION_CONFIG } from "./recommendation.config";
import type {
  DailyPlan,
  RecommendationInput,
  RecommendationStrategy,
} from "./recommendation.types";

export interface StudyProfile {
  /** The exam date the student set, YYYY-MM-DD. */
  readonly examDate: string | null;
  readonly quota: Quota;
}

/** What this service needs from the rest of the system; declared here, next to its only consumer. */
interface Dependencies {
  readonly strategy: RecommendationStrategy;
  readonly history: { load(userId: string): Promise<readonly AttemptSignal[]> };
  readonly mastery: MasteryService;
  readonly time: TimeAnalyticsService;
  readonly reviews: { countDue(userId: string): Promise<number> };
  readonly store: {
    countUnresolvedMistakes(userId: string): Promise<number>;
    getStudyProfile(userId: string): Promise<StudyProfile | null>;
  };
  readonly clock: () => Date;
}

const ACTIVITY_WINDOW_DAYS = 7;

/**
 * Answers "what should this student study today?": measures the student, then asks the strategy in
 * use to turn the measurements into a plan. It does not decide the plan itself.
 */
export class RecommendationService {
  constructor(private readonly deps: Dependencies) {}

  async today(userId: string, options: { readonly availableMinutes?: number }): Promise<DailyPlan> {
    const { minutes } = RECOMMENDATION_CONFIG;
    const availableMinutes = options.availableMinutes ?? minutes.default;
    if (
      !Number.isInteger(availableMinutes) ||
      availableMinutes < minutes.min ||
      availableMinutes > minutes.max
    ) {
      throw new ValidationError(
        `Study time must be between ${minutes.min} and ${minutes.max} minutes.`,
      );
    }

    const { history, mastery, time, reviews, store, clock } = this.deps;
    const now = clock();
    const [attempts, dueReviews, unresolvedMistakes, profile] = await Promise.all([
      history.load(userId),
      reviews.countDue(userId),
      store.countUnresolvedMistakes(userId),
      store.getStudyProfile(userId),
    ]);
    if (profile === null) throw new NotFoundError("Profile not found.");

    const input: RecommendationInput = {
      now,
      availableMinutes,
      topics: mastery.analyze(attempts, now).topics,
      dueReviews,
      unresolvedMistakes,
      activity: this.activity(attempts, now),
      exam: this.exam(profile.examDate, now),
      pace: this.pace(attempts),
      remainingToday: remainingToday(profile.quota, now),
    };
    return this.deps.strategy.recommend(input);
  }

  /** Days with practice in the last week, and whole days since the latest practice. */
  private activity(attempts: readonly AttemptSignal[], now: Date): RecommendationInput["activity"] {
    // Days ago, one entry per day practised.
    const ages = new Set(attempts.map((attempt) => daysBetweenUtc(attempt.answeredAt, now)));
    return {
      activeDaysLast7: [...ages].filter((age) => age >= 0 && age < ACTIVITY_WINDOW_DAYS).length,
      daysSinceLastStudy: ages.size === 0 ? null : Math.max(0, Math.min(...ages)),
    };
  }

  private exam(examDate: string | null, now: Date): RecommendationInput["exam"] {
    return { date: examDate, daysToExam: daysUntilDate(examDate, now) };
  }

  private pace(attempts: readonly AttemptSignal[]): RecommendationInput["pace"] {
    const report = this.deps.time.analyze(attempts);
    return {
      averageSecondsPerQuestion:
        report.overall === null ? null : Math.round(report.overall.averageMs / 1000),
      slowButAccurate: report.insights.some((insight) => insight.code === "carefulButSlow"),
    };
  }
}
