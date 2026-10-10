import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { AttemptHistoryRepository } from "./attempt-history.repository.server";
import { AnalyticsService } from "./analytics.service";
import { ConfidenceAnalyticsService } from "./confidence/confidence.analytics";
import { LearningHistoryService } from "./learning-history.service";
import { MasteryService } from "./mastery/mastery.service";
import { DeterministicRecommendationStrategy } from "./recommendation/deterministic.strategy";
import { SupabasePerformanceStore } from "./performance/performance.repository.server";
import { PerformanceService } from "./performance/performance.service";
import { SupabaseRecommendationStore } from "./recommendation/recommendation.repository.server";
import { CatalogService } from "../questions/catalog.service";
import { SupabaseCatalogRepository } from "../questions/catalog.repository.server";
import { RecommendationService } from "./recommendation/recommendation.service";
import { SupabaseReadinessStore } from "./readiness/readiness.repository.server";
import { ReadinessService } from "./readiness/readiness.service";
import { SupabaseReviewStore } from "./review/review.repository.server";
import { ReviewService } from "./review/review.service";
import { Sm2ReviewScheduler } from "./review/sm2.scheduler";
import { AdaptiveSelectionService } from "./selection/adaptive-selection.service";
import { SupabaseQuestionProgressStore } from "./selection/question-progress.repository.server";
import { SupabaseSimilarStore } from "./similar/similar.repository.server";
import { SimilarQuestionService } from "./similar/similar.service";
import { TimeAnalyticsService } from "./time/time-analytics.service";

/**
 * Wires the intelligence services to the database. The one place their dependencies are chosen
 * (composition root); controllers ask for the graph instead of building their own.
 */
export function createIntelligence(
  db: SupabaseClient<Database>,
  clock: () => Date = () => new Date(),
) {
  const attempts = new AttemptHistoryRepository(db);
  const history = new LearningHistoryService(attempts);
  const reviews = new ReviewService({
    store: new SupabaseReviewStore(db),
    history: attempts,
    scheduler: new Sm2ReviewScheduler(),
    clock,
  });
  const progress = new SupabaseQuestionProgressStore(db);
  const mastery = new MasteryService();
  const confidence = new ConfidenceAnalyticsService();
  const time = new TimeAnalyticsService();
  const adaptiveSelection = new AdaptiveSelectionService({
    history,
    progress,
    reviews,
    mastery,
    clock,
  });
  const similar = new SimilarQuestionService({ store: new SupabaseSimilarStore(db), progress });
  const analytics = new AnalyticsService({ history, mastery, confidence, time, clock });
  const recommendationStore = new SupabaseRecommendationStore(db);
  const recommendation = new RecommendationService({
    strategy: new DeterministicRecommendationStrategy(),
    history,
    mastery,
    time,
    reviews,
    store: recommendationStore,
    clock,
  });
  const performanceStore = new SupabasePerformanceStore(db);
  const performance = new PerformanceService({
    history,
    reviews,
    store: {
      countUnresolvedMistakes: (userId) => recommendationStore.countUnresolvedMistakes(userId),
      countUnverifiedExams: (userId) => performanceStore.countUnverifiedExams(userId),
    },
    clock,
  });
  const catalog = new CatalogService(new SupabaseCatalogRepository(db));
  const readiness = new ReadinessService({
    history,
    mastery,
    time,
    store: new SupabaseReadinessStore(db),
    catalog,
    clock,
  });
  return {
    history,
    mastery,
    time,
    catalog,
    reviews,
    adaptiveSelection,
    similar,
    analytics,
    recommendation,
    readiness,
    performance,
  };
}
