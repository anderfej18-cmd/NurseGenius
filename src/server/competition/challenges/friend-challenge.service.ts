import { ConflictError, NotFoundError, ValidationError } from "@/lib/app-errors";
import { isCompleteQuestion } from "@/lib/questions";
import { resolveExamType } from "../../exam-type";
import { utcDate } from "../../intelligence/utc-days";
import { offsetBounds, toOffsetPage } from "../../pagination";
import { sampleWithoutReplacement } from "../../sessions/sampling";
import { assertWithinTierLimits } from "../../sessions/quota";
import type { PoolQuestion, Quota } from "../../sessions/session.types";
import type { ExamType, OffsetPage } from "../../types";
import { FRIEND_CHALLENGE_CONFIG, type FriendChallengeConfig } from "./friend-challenge.config";
import { type ChallengeState, type ChallengeView, challengeState } from "./friend-challenge";

const DAY_MS = 24 * 60 * 60 * 1000;

/** A challenge as the student sees it. The opponent's result appears only once the student has finished. */
export interface ChallengeSummary {
  readonly id: string;
  readonly role: ChallengeView["role"];
  readonly opponentUsername: string;
  readonly examType: ExamType;
  readonly totalQuestions: number;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  /** The student's own session for it, once started. */
  readonly examId: string | null;
  readonly state: ChallengeState;
}

/** What this service needs from the rest of the system; declared here, next to its only consumer. */
interface Dependencies {
  readonly store: {
    createChallenge(
      userId: string,
      friendshipId: string,
      examType: ExamType,
      questionIds: readonly string[],
      expiresAt: Date,
      maxOpen: number,
    ): Promise<string>;
    declineChallenge(userId: string, challengeId: string): Promise<void>;
    startSession(
      userId: string,
      challengeId: string,
      minutes: number,
      today: string,
    ): Promise<string>;
    getView(userId: string, challengeId: string): Promise<ChallengeView | null>;
    listViews(
      userId: string,
      page: { limit: number; offset: number },
    ): Promise<readonly ChallengeView[]>;
  };
  readonly profile: {
    getProfile(userId: string): Promise<{ quota: Quota; examPreference: string | null } | null>;
  };
  readonly pool: { listQuestionPool(examType: ExamType, topic: null): Promise<PoolQuestion[]> };
  readonly clock: () => Date;
  readonly random: () => number;
  readonly config?: FriendChallengeConfig;
}

/**
 * Friend challenges: a student sets a random question set for a friend and both take it as ordinary
 * exam sessions, so every session rule applies and the result is read from the two scored exams.
 * Rules in docs/formulas.md (section 14).
 */
export class FriendChallengeService {
  private readonly config: FriendChallengeConfig;

  constructor(private readonly deps: Dependencies) {
    this.config = deps.config ?? FRIEND_CHALLENGE_CONFIG;
  }

  /** The database checks that the student and the other student are friends and caps open challenges. */
  async create(
    userId: string,
    input: { friendshipId: string; examType?: ExamType },
  ): Promise<{ challengeId: string }> {
    const { store, profile, pool, clock, random } = this.deps;
    const student = await profile.getProfile(userId);
    if (student === null) throw new NotFoundError("Profile not found.");
    const examType = resolveExamType(input.examType, student.examPreference);

    const candidates = (await pool.listQuestionPool(examType, null)).filter(isCompleteQuestion);
    if (candidates.length === 0) {
      throw new ValidationError("No questions are available for a challenge yet.");
    }
    const questions = sampleWithoutReplacement(candidates, this.config.questions, random);
    const expiresAt = new Date(clock().getTime() + this.config.expiresInDays * DAY_MS);

    const challengeId = await store.createChallenge(
      userId,
      input.friendshipId,
      examType,
      questions.map((question) => question.id),
      expiresAt,
      this.config.maxOpen,
    );
    return { challengeId };
  }

  async decline(userId: string, input: { challengeId: string }): Promise<{ declined: true }> {
    await this.deps.store.declineChallenge(userId, input.challengeId);
    return { declined: true };
  }

  async start(
    userId: string,
    input: { challengeId: string },
  ): Promise<{ examId: string; totalQuestions: number }> {
    const { store, profile, clock } = this.deps;
    const view = await this.find(userId, input.challengeId);
    if (view.myExamId !== null && view.myExamStatus === "in_progress") {
      return { examId: view.myExamId, totalQuestions: view.totalQuestions };
    }

    const now = clock();
    const state = challengeState(view, now);
    switch (state.status) {
      case "not_started":
        break;
      case "in_progress":
      case "waiting_for_opponent":
      case "completed":
        throw new ConflictError("You have already finished this challenge.");
      case "declined":
      case "expired":
        throw new ConflictError("This challenge has closed.");
      default:
        return assertNever(state);
    }

    const student = await profile.getProfile(userId);
    if (student === null) throw new NotFoundError("Profile not found.");
    assertWithinTierLimits(student.quota, view.totalQuestions, now);

    const examId = await store.startSession(userId, view.id, this.config.minutes, utcDate(now));
    return { examId, totalQuestions: view.totalQuestions };
  }

  async get(userId: string, input: { challengeId: string }): Promise<ChallengeSummary> {
    return this.summarize(await this.find(userId, input.challengeId));
  }

  async list(
    userId: string,
    request: { limit?: number; offset?: number },
  ): Promise<OffsetPage<ChallengeSummary>> {
    const { offset, limit } = offsetBounds(request);
    const rows = await this.deps.store.listViews(userId, { limit: limit + 1, offset });
    const page = toOffsetPage([...rows], limit, offset);
    return { ...page, items: page.items.map((view) => this.summarize(view)) };
  }

  private async find(userId: string, challengeId: string): Promise<ChallengeView> {
    const view = await this.deps.store.getView(userId, challengeId);
    if (view === null) throw new NotFoundError("Challenge not found.");
    return view;
  }

  private summarize(view: ChallengeView): ChallengeSummary {
    return {
      id: view.id,
      role: view.role,
      opponentUsername: view.opponentUsername,
      examType: view.examType,
      totalQuestions: view.totalQuestions,
      createdAt: view.createdAt,
      expiresAt: view.expiresAt,
      examId: view.myExamId,
      state: challengeState(view, this.deps.clock()),
    };
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled challenge state: ${JSON.stringify(value)}`);
}
