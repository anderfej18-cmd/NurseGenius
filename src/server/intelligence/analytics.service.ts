import type { AttemptSignal } from "./attempt.types";
import type {
  ConfidenceAnalyticsService,
  ConfidenceReport,
} from "./confidence/confidence.analytics";
import type { MasteryReport, MasteryService } from "./mastery/mastery.service";
import type { TimeAnalyticsReport, TimeAnalyticsService } from "./time/time-analytics.service";

interface Dependencies {
  readonly history: { load(userId: string): Promise<readonly AttemptSignal[]> };
  readonly mastery: MasteryService;
  readonly confidence: ConfidenceAnalyticsService;
  readonly time: TimeAnalyticsService;
  readonly clock: () => Date;
}

export interface PeriodRequest {
  /** Only attempts from the last N days; the whole history when omitted. */
  readonly periodDays?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Read side of the engines: loads one student's history and hands it to the analysis. */
export class AnalyticsService {
  constructor(private readonly deps: Dependencies) {}

  async mastery(userId: string): Promise<MasteryReport> {
    const attempts = await this.deps.history.load(userId);
    return this.deps.mastery.analyze(attempts, this.deps.clock());
  }

  async confidence(userId: string, request: PeriodRequest): Promise<ConfidenceReport> {
    const attempts = await this.deps.history.load(userId);
    return this.deps.confidence.analyze(attempts, { since: this.since(request) });
  }

  async time(userId: string, request: PeriodRequest): Promise<TimeAnalyticsReport> {
    const attempts = await this.deps.history.load(userId);
    return this.deps.time.analyze(attempts, { since: this.since(request) });
  }

  private since(request: PeriodRequest): Date | undefined {
    return request.periodDays === undefined
      ? undefined
      : new Date(this.deps.clock().getTime() - request.periodDays * DAY_MS);
  }
}
