import { questionIssues } from "@/lib/questions";
import { ForbiddenError, ValidationError } from "../errors";
import { type LimitRule, type RateLimiter, enforceLimits } from "../rate-limit/rate-limit";
import type { ExamType } from "../types";
import { CUSTOM_TEST_CONFIG as CONFIG } from "./custom-tests.config";
import { maskEmail } from "./mask-email";

const SHA256_HEX = /^[a-f0-9]{64}$/i;
const EMAIL = /^\S+@\S+\.\S+$/;
const MAX_EMAIL_LENGTH = 254;
const MIN_ACCESS_KEY_LENGTH = 32;
const MS_PER_DAY = 86_400_000;

export interface NewCustomTestQuestion {
  readonly question_text: string;
  readonly option_a: string;
  readonly option_b: string;
  readonly option_c: string;
  readonly option_d: string;
  readonly correct_answer: string;
  readonly rationale: string | null;
}

export interface Allocation {
  readonly topic: string;
  readonly count: number;
}

/** When a test runs and for how long each candidate has. */
export interface Schedule {
  readonly startsAt: string;
  readonly expiresAt: string;
  readonly durationMinutes: number;
}

/** A bank test names how many questions to draw per subcategory; an upload brings its own questions. */
export interface NewLiveTest extends Schedule {
  readonly title: string;
  readonly description: string;
  readonly examType: ExamType;
  readonly sourceMode: "existing" | "upload";
  readonly allocations: readonly Allocation[];
  readonly questions: readonly NewCustomTestQuestion[];
}

export interface ShareLink {
  /** The token that goes in the address: `/test/<token>`. */
  readonly token: string;
  readonly tokenHash: string;
}

export interface TestSummary {
  readonly id: string;
  readonly owner_id: string;
  readonly owner_username: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly exam_type: ExamType;
  readonly source_mode: string;
  readonly duration_minutes: number;
  readonly starts_at: string;
  readonly expires_at: string;
  readonly status: string;
  readonly created_at: string;
  readonly share_token: string | null;
  readonly state: "upcoming" | "live" | "closed";
  readonly question_count: number;
  readonly participant_count: number;
  readonly pass_count: number;
  readonly average_score: number;
  readonly custom_unimported: number;
}

export interface FinishedAttempt {
  readonly id: string;
  readonly custom_test_id: string;
  readonly email: string;
  readonly score_pct: number | null;
  readonly correct_count: number | null;
  readonly total_questions: number;
  readonly completed_at: string | null;
}

export interface SharedTestState {
  readonly state: "upcoming" | "live" | "closed";
  readonly serverNow: string;
  readonly test: {
    readonly title: string;
    readonly description: string | null;
    readonly examType: ExamType;
    readonly durationMinutes: number;
    readonly questionCount: number;
    readonly startsAt: string;
    readonly expiresAt: string;
  } | null;
}

export interface SharedQuestion {
  readonly id: string;
  readonly position: number;
  readonly question_text: string;
  readonly option_a: string;
  readonly option_b: string;
  readonly option_c: string;
  readonly option_d: string;
  readonly answer: string | null;
  readonly flagged: boolean;
}

export interface SharedResultItem {
  question_id: string;
  question_position: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  rationale: string | null;
  user_answer: string | null;
  is_correct: boolean;
}

/** Shown only after the attempt is closed, which is why it may carry the answer key. */
export interface SharedTestResult {
  score: number;
  correct: number;
  total: number;
  results: SharedResultItem[];
}

/** An attempt as its own device sees it: while open, the questions (no key) and what is saved; once closed, the result. */
export interface AttemptView {
  readonly status: "in_progress" | "completed" | "abandoned";
  readonly serverNow: string;
  readonly startedAt: string;
  readonly deadlineAt: string;
  readonly test: {
    readonly title: string;
    readonly description: string | null;
    readonly examType: ExamType;
    readonly durationMinutes: number;
  };
  readonly email: string;
  readonly linked: boolean;
  readonly questions: readonly SharedQuestion[];
  readonly result: SharedTestResult | null;
}

export interface SubmittedAnswer {
  readonly question_id: string;
  readonly user_answer: string | null;
}

/** What this service needs from the rest of the system; declared here, next to its only consumer. */
export interface CustomTestStore {
  createTest(ownerId: string, test: NewLiveTest, link: ShareLink): Promise<string>;
  republish(actorId: string, testId: string, schedule: Schedule, link: ShareLink): Promise<void>;
  tests(actorId: string): Promise<readonly TestSummary[]>;
  closedAttempts(actorId: string, testIds: readonly string[]): Promise<readonly FinishedAttempt[]>;
  importQuestions(
    actorId: string,
    testId: string,
    examType: ExamType,
    topic: string,
  ): Promise<{ added: number; skipped: number }>;
  sharedState(tokenHash: string): Promise<SharedTestState>;
  startAttempt(
    tokenHash: string,
    email: string,
    accessHash: string,
  ): Promise<{ attemptId: string }>;
  attempt(attemptId: string, accessHash: string): Promise<AttemptView>;
  saveAnswer(input: {
    attemptId: string;
    accessHash: string;
    questionId: string;
    answer: string | null;
    flagged: boolean;
  }): Promise<void>;
  submitAttempt(
    attemptId: string,
    accessHash: string,
    answers: readonly SubmittedAnswer[],
  ): Promise<SharedTestResult>;
  claimAttempt(attemptId: string, accessHash: string, userId: string): Promise<boolean>;
}

interface Dependencies {
  readonly store: CustomTestStore;
  readonly limiter: RateLimiter;
  /** SHA-256 hex of the attempt key: the database keeps only this. */
  readonly digest: (value: string) => Promise<string>;
  /** A fresh link token and its hash. */
  readonly newLink: () => Promise<ShareLink>;
  /** The account's email address when, and only when, the identity provider has confirmed it. */
  readonly verifiedEmailOf: (userId: string) => Promise<string | null>;
  readonly clock: () => Date;
}

/** Who is asking: the central admin sees every test and every address; any other admin sees their own, masked. */
export interface Actor {
  readonly id: string;
  readonly central: boolean;
}

/**
 * Live tests: admin-built, scheduled tests that anyone holding a link can take. The link token and the
 * attempt key are the public credentials; every public entry point is rate limited (ADR-0007), every
 * clock that matters is the database's, and every score comes from the database, from the stored key.
 */
export class CustomTestService {
  constructor(private readonly deps: Dependencies) {}

  async create(adminId: string, input: NewLiveTest): Promise<{ id: string; token: string }> {
    const title = input.title.trim();
    if (title === "") throw new ValidationError("Enter a title for the test.");
    this.assertSchedule(input);
    const questionCount = this.assertQuestions(input);
    if (questionCount < CONFIG.minQuestions || questionCount > CONFIG.maxQuestions) {
      throw new ValidationError(
        `A test needs between ${CONFIG.minQuestions} and ${CONFIG.maxQuestions} questions.`,
      );
    }
    const link = await this.deps.newLink();
    const id = await this.deps.store.createTest(adminId, { ...input, title }, link);
    return { id, token: link.token };
  }

  async republish(actor: Actor, input: { testId: string } & Schedule): Promise<{ token: string }> {
    this.assertSchedule(input);
    const link = await this.deps.newLink();
    await this.deps.store.republish(actor.id, input.testId, input, link);
    return { token: link.token };
  }

  async list(actor: Actor) {
    const tests = await this.deps.store.tests(actor.id);
    const attempts =
      tests.length === 0
        ? []
        : await this.deps.store.closedAttempts(
            actor.id,
            tests.map((test) => test.id),
          );
    return tests.map((test) => {
      const failed = test.participant_count - test.pass_count;
      return {
        ...test,
        // The link and the owner's name are for managers; a sub-admin sees only their own tests anyway.
        analytics: {
          participant_count: test.participant_count,
          pass_count: test.pass_count,
          fail_count: failed,
          pass_pct:
            test.participant_count === 0
              ? 0
              : Number(((test.pass_count / test.participant_count) * 100).toFixed(2)),
          average_score: test.average_score,
        },
        // Rankings exist only once a test has closed; addresses are masked unless the central admin asks.
        attempts: attempts
          .filter((attempt) => attempt.custom_test_id === test.id)
          .slice(0, CONFIG.maxAttemptsListed)
          .map((attempt) => ({
            ...attempt,
            email: actor.central ? attempt.email : maskEmail(attempt.email),
          })),
      };
    });
  }

  async importToBank(
    actor: Actor,
    input: { testId: string; examType: ExamType; topic: string },
  ): Promise<{ added: number; skipped: number }> {
    const topic = input.topic.trim();
    if (topic === "") throw new ValidationError("Enter a subcategory.");
    return this.deps.store.importQuestions(actor.id, input.testId, input.examType, topic);
  }

  async getShared(input: { tokenHash: string }, address: string): Promise<SharedTestState> {
    const closed: SharedTestState = {
      state: "closed",
      serverNow: this.deps.clock().toISOString(),
      test: null,
    };
    if (!SHA256_HEX.test(input.tokenHash)) return closed;
    await enforceLimits(this.deps.limiter, [
      this.rule(`shared-view:ip:${address}`, CONFIG.limits.viewPerAddress),
    ]);
    return this.deps.store.sharedState(input.tokenHash);
  }

  async startShared(
    input: { tokenHash: string; email: string; accessKey: string },
    address: string,
  ): Promise<{ attemptId: string; attempt: AttemptView }> {
    const email = input.email.trim().toLowerCase();
    if (email.length > MAX_EMAIL_LENGTH || !EMAIL.test(email))
      throw new ValidationError("Enter a valid email address.");
    if (!SHA256_HEX.test(input.tokenHash) || input.accessKey.length < MIN_ACCESS_KEY_LENGTH) {
      throw new ValidationError("Invalid test link or attempt key.");
    }
    await enforceLimits(this.deps.limiter, [
      this.rule(`shared-start:ip:${address}`, CONFIG.limits.startPerAddress),
      this.rule(
        `shared-start:mail:${input.tokenHash}:${email}`,
        CONFIG.limits.startPerEmailAndTest,
      ),
    ]);
    const accessHash = await this.deps.digest(input.accessKey);
    const { attemptId } = await this.deps.store.startAttempt(input.tokenHash, email, accessHash);
    return { attemptId, attempt: await this.deps.store.attempt(attemptId, accessHash) };
  }

  /** The attempt again, for a reload or a return visit: the key proves it is the same device. */
  async getAttempt(
    input: { attemptId: string; accessKey: string },
    address: string,
  ): Promise<AttemptView> {
    await enforceLimits(this.deps.limiter, [
      this.rule(`shared-resume:ip:${address}`, CONFIG.limits.resumePerAddress),
    ]);
    return this.deps.store.attempt(input.attemptId, await this.deps.digest(input.accessKey));
  }

  async saveAnswer(input: {
    attemptId: string;
    accessKey: string;
    questionId: string;
    answer: string | null;
    flagged: boolean;
  }): Promise<{ saved: true }> {
    await enforceLimits(this.deps.limiter, [
      this.rule(`shared-save:attempt:${input.attemptId}`, CONFIG.limits.savePerAttempt),
    ]);
    await this.deps.store.saveAnswer({
      attemptId: input.attemptId,
      accessHash: await this.deps.digest(input.accessKey),
      questionId: input.questionId,
      answer: input.answer,
      flagged: input.flagged,
    });
    return { saved: true };
  }

  async submitShared(
    input: { attemptId: string; accessKey: string; answers: readonly SubmittedAnswer[] },
    address: string,
  ): Promise<SharedTestResult> {
    await enforceLimits(this.deps.limiter, [
      this.rule(`shared-submit:ip:${address}`, CONFIG.limits.submitPerAddress),
    ]);
    return this.deps.store.submitAttempt(
      input.attemptId,
      await this.deps.digest(input.accessKey),
      input.answers,
    );
  }

  /**
   * Links a taken test to the signed-in account. Three things must hold: the caller holds the attempt key
   * (this device took the test), the account's email is one the identity provider has confirmed, and that
   * confirmed address is the one the test was taken with. An address anyone can type proves nothing.
   */
  async claim(
    userId: string,
    input: { attemptId: string; accessKey: string },
  ): Promise<{ claimed: boolean }> {
    const hash = await this.deps.digest(input.accessKey);
    const attempt = await this.deps.store.attempt(input.attemptId, hash);
    const verified = await this.deps.verifiedEmailOf(userId);
    if (verified === null)
      throw new ForbiddenError("Confirm your email address before saving this result.");
    if (attempt.email !== verified.toLowerCase())
      throw new ForbiddenError("Sign in with the email used for this test.");
    return { claimed: await this.deps.store.claimAttempt(input.attemptId, hash, userId) };
  }

  private assertSchedule(schedule: Schedule): void {
    const now = this.deps.clock().getTime();
    const start = Date.parse(schedule.startsAt);
    const end = Date.parse(schedule.expiresAt);
    if (Number.isNaN(start) || Number.isNaN(end))
      throw new ValidationError("Choose a start and an end time.");
    if (end <= now) throw new ValidationError("The test must end in the future.");
    if (end <= start) throw new ValidationError("The test must end after it starts.");
    if (end - start > CONFIG.maxWindowDays * MS_PER_DAY)
      throw new ValidationError(`A test can stay open for at most ${CONFIG.maxWindowDays} days.`);
    if (
      !Number.isInteger(schedule.durationMinutes) ||
      schedule.durationMinutes < CONFIG.minDurationMinutes ||
      schedule.durationMinutes > CONFIG.maxDurationMinutes
    )
      throw new ValidationError("Duration must be between 10 minutes and 3 hours.");
  }

  /** The number of questions the test will hold; checks what can be checked before the database draws. */
  private assertQuestions(input: NewLiveTest): number {
    if (input.sourceMode === "upload") {
      if (input.questions.some((question) => questionIssues(question).length > 0)) {
        throw new ValidationError(
          "Every test question must include a question, four choices, and a valid correct answer.",
        );
      }
      return input.questions.length;
    }
    const topics = input.allocations.map((allocation) => allocation.topic.trim());
    if (topics.some((topic) => topic === "") || new Set(topics).size !== topics.length)
      throw new ValidationError("Each subcategory can be chosen once.");
    if (input.allocations.some((a) => !Number.isInteger(a.count) || a.count < 1))
      throw new ValidationError("Ask for at least one question from each chosen subcategory.");
    return input.allocations.reduce((sum, allocation) => sum + allocation.count, 0);
  }

  private rule(bucket: string, limit: { limit: number; windowSeconds: number }): LimitRule {
    return { bucket, limit: limit.limit, windowSeconds: limit.windowSeconds };
  }
}
