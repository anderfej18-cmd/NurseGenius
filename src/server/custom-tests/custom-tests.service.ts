import { questionIssues } from "@/lib/questions";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { type LimitRule, type RateLimiter, enforceLimits } from "../rate-limit/rate-limit";
import type { ExamType } from "../types";
import { CUSTOM_TEST_CONFIG as CONFIG } from "./custom-tests.config";

const SHA256_HEX = /^[a-f0-9]{64}$/i;
const EMAIL = /^\S+@\S+\.\S+$/;
const MAX_EMAIL_LENGTH = 254;
const MIN_ACCESS_KEY_LENGTH = 32;

export interface NewCustomTestQuestion {
  readonly question_text: string;
  readonly option_a: string;
  readonly option_b: string;
  readonly option_c: string;
  readonly option_d: string;
  readonly correct_answer: string;
  readonly rationale: string | null;
  readonly source_question_id?: string | null;
  readonly source_kind: "existing" | "custom";
}

export interface NewCustomTest {
  readonly title: string;
  readonly description: string;
  readonly examType: ExamType;
  readonly sourceMode: "existing" | "upload";
  readonly durationMinutes: number;
  readonly expiresAt: string;
  readonly tokenHash: string;
  readonly questions: readonly NewCustomTestQuestion[];
}

export interface TestSummary {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly exam_type: ExamType;
  readonly source_mode: string;
  readonly duration_minutes: number;
  readonly expires_at: string;
  readonly status: string;
  readonly created_at: string;
  readonly question_count: number;
  readonly participant_count: number;
  readonly pass_count: number;
  readonly average_score: number;
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

interface PublishedTest {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly examType: ExamType;
  readonly durationMinutes: number;
  readonly expiresAt: string;
}

interface SharedQuestion {
  id: string;
  position: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
}

export interface SubmittedAnswer {
  readonly question_id: string;
  readonly user_answer: string | null;
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

/** What this service needs from the rest of the system; declared here, next to its only consumer. */
export interface CustomTestStore {
  createTest(ownerId: string, test: NewCustomTest): Promise<string>;
  summaries(ownerId: string): Promise<readonly TestSummary[]>;
  completedAttempts(testIds: readonly string[]): Promise<readonly FinishedAttempt[]>;
  findPublished(tokenHash: string, now: Date): Promise<PublishedTest | null>;
  sharedQuestions(testId: string): Promise<SharedQuestion[]>;
  countQuestions(testId: string): Promise<number>;
  insertAttempt(attempt: {
    testId: string;
    email: string;
    accessHash: string;
    totalQuestions: number;
  }): Promise<{ attemptId: string; startedAt: string }>;
  submitAttempt(
    attemptId: string,
    accessHash: string,
    answers: readonly SubmittedAnswer[],
  ): Promise<SharedTestResult>;
  findAttempt(
    attemptId: string,
    accessHash: string,
  ): Promise<{ id: string; email: string; userId: string | null } | null>;
  claimAttempt(attemptId: string, accessHash: string, userId: string): Promise<boolean>;
  republish(
    ownerId: string,
    testId: string,
    tokenHash: string,
    expiresAt: string,
  ): Promise<boolean>;
  importToBank(ownerId: string, testId: string, topic: string): Promise<number>;
}

interface Dependencies {
  readonly store: CustomTestStore;
  readonly limiter: RateLimiter;
  /** SHA-256 hex of the attempt key: the database keeps only this. */
  readonly digest: (value: string) => Promise<string>;
  readonly clock: () => Date;
}

/**
 * Admin-built tests that anyone holding a link can take. The link token and the attempt key are the
 * public credentials; every public entry point is rate limited (ADR-0007) and every score comes
 * from the database, from the stored key.
 */
export class CustomTestService {
  constructor(private readonly deps: Dependencies) {}

  async create(adminId: string, input: NewCustomTest): Promise<{ id: string }> {
    const title = input.title.trim();
    if (title === "") throw new ValidationError("Enter a title for the test.");
    const count = input.questions.length;
    if (count < CONFIG.minQuestions || count > CONFIG.maxQuestions) {
      throw new ValidationError(
        `A test needs between ${CONFIG.minQuestions} and ${CONFIG.maxQuestions} questions.`,
      );
    }
    if (!SHA256_HEX.test(input.tokenHash)) throw new ValidationError("Invalid test-link token.");
    if (
      input.durationMinutes < CONFIG.minDurationMinutes ||
      input.durationMinutes > CONFIG.maxDurationMinutes
    ) {
      throw new ValidationError("Duration must be between 10 minutes and 3 hours.");
    }
    this.assertFuture(input.expiresAt, "Link expiry must be in the future.");
    if (input.questions.some((question) => questionIssues(question).length > 0)) {
      throw new ValidationError(
        "Every test question must include a question, four choices, and a valid correct answer.",
      );
    }
    return { id: await this.deps.store.createTest(adminId, { ...input, title }) };
  }

  async list(adminId: string) {
    const summaries = await this.deps.store.summaries(adminId);
    const attempts =
      summaries.length === 0
        ? []
        : await this.deps.store.completedAttempts(summaries.map((s) => s.id));
    return summaries.map((test) => {
      const mine = attempts
        .filter((attempt) => attempt.custom_test_id === test.id)
        .sort((a, b) => (b.score_pct ?? 0) - (a.score_pct ?? 0))
        .slice(0, CONFIG.maxAttemptsListed);
      const failed = test.participant_count - test.pass_count;
      return {
        ...test,
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
        attempts: mine,
      };
    });
  }

  async getShared(input: { tokenHash: string }, address: string) {
    const expired = { expired: true as const, test: null, questions: [] };
    if (!SHA256_HEX.test(input.tokenHash)) return expired;
    await enforceLimits(this.deps.limiter, [
      this.rule(`shared-view:ip:${address}`, CONFIG.limits.viewPerAddress),
    ]);
    const test = await this.deps.store.findPublished(input.tokenHash, this.deps.clock());
    if (test === null) return expired;
    return {
      expired: false as const,
      test: {
        id: test.id,
        title: test.title,
        description: test.description,
        exam_type: test.examType,
        duration_minutes: test.durationMinutes,
        expires_at: test.expiresAt,
      },
      questions: await this.deps.store.sharedQuestions(test.id),
    };
  }

  async startShared(
    input: { tokenHash: string; email: string; accessKey: string },
    address: string,
  ) {
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
    const test = await this.deps.store.findPublished(input.tokenHash, this.deps.clock());
    if (test === null) throw new NotFoundError("This test link has expired or does not exist.");
    const totalQuestions = await this.deps.store.countQuestions(test.id);
    if (totalQuestions === 0) throw new ValidationError("This test has no questions.");
    const attempt = await this.deps.store.insertAttempt({
      testId: test.id,
      email,
      accessHash: await this.deps.digest(input.accessKey),
      totalQuestions,
    });
    return {
      attemptId: attempt.attemptId,
      durationMinutes: test.durationMinutes,
      totalQuestions,
      startedAt: attempt.startedAt,
      accessKey: input.accessKey,
    };
  }

  async submitShared(
    input: { attemptId: string; accessKey: string; answers: readonly SubmittedAnswer[] },
    address: string,
  ): Promise<SharedTestResult> {
    if (input.answers.length === 0) throw new ValidationError("Invalid answer list.");
    await enforceLimits(this.deps.limiter, [
      this.rule(`shared-submit:ip:${address}`, CONFIG.limits.submitPerAddress),
    ]);
    return this.deps.store.submitAttempt(
      input.attemptId,
      await this.deps.digest(input.accessKey),
      input.answers,
    );
  }

  /** Links a finished or running attempt to the signed-in account that took it with the same email. */
  async claim(
    userId: string,
    accountEmail: string | undefined,
    input: { attemptId: string; accessKey: string },
  ): Promise<{ claimed: boolean }> {
    const hash = await this.deps.digest(input.accessKey);
    const attempt = await this.deps.store.findAttempt(input.attemptId, hash);
    if (attempt === null) throw new NotFoundError("Attempt not found.");
    if (accountEmail === undefined || attempt.email !== accountEmail.toLowerCase()) {
      throw new ForbiddenError("Sign in with the email used for this test.");
    }
    if (attempt.userId !== null && attempt.userId !== userId) {
      throw new ForbiddenError("This attempt belongs to another account.");
    }
    return { claimed: await this.deps.store.claimAttempt(input.attemptId, hash, userId) };
  }

  async republish(
    adminId: string,
    input: { testId: string; tokenHash: string; expiresAt: string },
  ): Promise<{ ok: true }> {
    if (!SHA256_HEX.test(input.tokenHash)) throw new ValidationError("Invalid test-link token.");
    this.assertFuture(input.expiresAt, "Expiry must be in the future.");
    const found = await this.deps.store.republish(
      adminId,
      input.testId,
      input.tokenHash,
      input.expiresAt,
    );
    if (!found) throw new NotFoundError("Test not found or not owned by you.");
    return { ok: true };
  }

  async importToBank(
    adminId: string,
    input: { testId: string; topic: string },
  ): Promise<{ count: number }> {
    const topic = input.topic.trim();
    if (topic === "") throw new ValidationError("Enter a subcategory.");
    return { count: await this.deps.store.importToBank(adminId, input.testId, topic) };
  }

  private rule(bucket: string, limit: { limit: number; windowSeconds: number }): LimitRule {
    return { bucket, limit: limit.limit, windowSeconds: limit.windowSeconds };
  }

  private assertFuture(iso: string, message: string): void {
    const time = Date.parse(iso);
    if (Number.isNaN(time) || time <= this.deps.clock().getTime())
      throw new ValidationError(message);
  }
}
