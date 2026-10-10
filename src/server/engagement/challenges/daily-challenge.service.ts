import { NotFoundError, ValidationError, ConflictError } from "@/lib/app-errors";
import { isCompleteQuestion } from "@/lib/questions";
import { resolveExamType } from "../../exam-type";
import { utcDate } from "../../intelligence/utc-days";
import { assertWithinTierLimits } from "../../sessions/quota";
import type { PoolQuestion, Quota } from "../../sessions/session.types";
import type { ExamType } from "../../types";
import { DAILY_CHALLENGE_CONFIG, type DailyChallengeConfig } from "./daily-challenge.config";

/** A student's challenge for one day, with the state of its exam; no question content. */
export interface ChallengeView {
  readonly id: string;
  readonly challengeDate: string;
  readonly examType: ExamType;
  readonly totalQuestions: number;
  readonly examId: string | null;
  /** `in_progress` or `completed`; null before the challenge is started. */
  readonly examStatus: string | null;
  readonly correct: number | null;
  readonly scorePct: number | null;
  readonly completedAt: Date | null;
}

export type ChallengeStatus = "not_started" | "in_progress" | "completed";

export interface ChallengeState {
  readonly id: string;
  readonly date: string;
  readonly examType: ExamType;
  readonly totalQuestions: number;
  readonly status: ChallengeStatus;
  readonly examId: string | null;
  readonly result: {
    readonly correct: number;
    readonly total: number;
    readonly scorePct: number;
    readonly completedAt: Date;
  } | null;
}

/** What this service needs from the rest of the system; declared here, next to its only consumer. */
interface Dependencies {
  readonly store: {
    getProfile(userId: string): Promise<{ quota: Quota; examPreference: string | null } | null>;
    getChallengeView(userId: string, date: string): Promise<ChallengeView | null>;
    createChallenge(
      userId: string,
      date: string,
      examType: ExamType,
      questionIds: readonly string[],
    ): Promise<string>;
    startChallengeSession(
      userId: string,
      challengeId: string,
      minutes: number,
      today: string,
    ): Promise<string>;
  };
  readonly pool: { listQuestionPool(examType: ExamType, topic: null): Promise<PoolQuestion[]> };
  readonly selection: {
    pick(userId: string, pool: readonly PoolQuestion[], count: number): Promise<PoolQuestion[]>;
  };
  readonly clock: () => Date;
  readonly config?: DailyChallengeConfig;
}

/**
 * One stored challenge per student per UTC day. The server chooses the questions when the day's
 * instance is first needed and never changes them; the student takes it as an ordinary exam session,
 * so every session rule applies. Rules in docs/formulas.md (section 12).
 */
export class DailyChallengeService {
  private readonly config: DailyChallengeConfig;

  constructor(private readonly deps: Dependencies) {
    this.config = deps.config ?? DAILY_CHALLENGE_CONFIG;
  }

  async today(userId: string, request: { examType?: ExamType }): Promise<ChallengeState> {
    return toState(await this.ensure(userId, request));
  }

  async start(
    userId: string,
    request: { examType?: ExamType },
  ): Promise<{ examId: string; totalQuestions: number }> {
    const { store, clock } = this.deps;
    const challenge = await this.ensure(userId, request);
    if (challenge.examStatus === "completed") {
      throw new ConflictError("Today's challenge is already finished. A new one opens tomorrow.");
    }
    if (challenge.examId !== null) {
      return { examId: challenge.examId, totalQuestions: challenge.totalQuestions };
    }

    const profile = await store.getProfile(userId);
    if (profile === null) throw new NotFoundError("Profile not found.");
    const now = clock();
    assertWithinTierLimits(profile.quota, challenge.totalQuestions, now);

    const examId = await store.startChallengeSession(
      userId,
      challenge.id,
      this.config.minutes,
      utcDate(now),
    );
    return { examId, totalQuestions: challenge.totalQuestions };
  }

  /** The day's challenge, created from the student's history the first time it is needed. */
  private async ensure(userId: string, request: { examType?: ExamType }): Promise<ChallengeView> {
    const { store, pool, selection, clock } = this.deps;
    const date = utcDate(clock());
    const existing = await store.getChallengeView(userId, date);
    if (existing !== null) return existing;

    const profile = await store.getProfile(userId);
    if (profile === null) throw new NotFoundError("Profile not found.");
    const examType = resolveExamType(request.examType, profile.examPreference);

    const candidates = (await pool.listQuestionPool(examType, null)).filter(isCompleteQuestion);
    const picked = await selection.pick(userId, candidates, this.config.questions);
    if (picked.length === 0) {
      throw new ValidationError("No questions are available for a challenge yet.");
    }
    await store.createChallenge(
      userId,
      date,
      examType,
      picked.map((question) => question.id),
    );

    const created = await store.getChallengeView(userId, date);
    if (created === null) throw new Error("The daily challenge was not stored.");
    return created;
  }
}

function toState(view: ChallengeView): ChallengeState {
  return {
    id: view.id,
    date: view.challengeDate,
    examType: view.examType,
    totalQuestions: view.totalQuestions,
    status: statusOf(view),
    examId: view.examId,
    result: resultOf(view),
  };
}

function resultOf(view: ChallengeView): ChallengeState["result"] {
  if (
    view.examStatus !== "completed" ||
    view.correct === null ||
    view.scorePct === null ||
    view.completedAt === null
  ) {
    return null;
  }
  return {
    correct: view.correct,
    total: view.totalQuestions,
    scorePct: view.scorePct,
    completedAt: view.completedAt,
  };
}

function statusOf(view: ChallengeView): ChallengeStatus {
  if (view.examStatus === "completed") return "completed";
  return view.examId === null ? "not_started" : "in_progress";
}
