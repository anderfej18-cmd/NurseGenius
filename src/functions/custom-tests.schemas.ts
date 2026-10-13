import { z } from "zod";
import { examTypeSchema } from "@/lib/exam-type";

// Shape and size limits only. The handlers keep their own checks (link format, expiry, answer
// choices) and their messages; the schemas stop wrong types and oversized input before any of that.
// The shared-test functions are public (the link is the credential), so this is their only gate.

const tokenHash = z.string().max(128);
const accessKey = z.string().max(256);
const isoDate = z.string().max(64);

export const getSharedTestSchema = z.object({ tokenHash }).strict();

export const startSharedTestSchema = z
  .object({ tokenHash, email: z.string().max(254), accessKey })
  .strict();

export const submitSharedTestSchema = z
  .object({
    attemptId: z.string().uuid(),
    accessKey,
    answers: z
      .array(
        z
          .object({ question_id: z.string().uuid(), user_answer: z.string().max(1).nullable() })
          .strict(),
      )
      .max(250),
  })
  .strict();

export const claimAttemptSchema = z.object({ attemptId: z.string().uuid(), accessKey }).strict();

const snapshotQuestionSchema = z
  .object({
    question_text: z.string().max(5000),
    option_a: z.string().max(1000),
    option_b: z.string().max(1000),
    option_c: z.string().max(1000),
    option_d: z.string().max(1000),
    correct_answer: z.string().max(5),
    rationale: z.string().max(5000).nullable(),
  })
  .strict();

const examTypeEnum = examTypeSchema;
const startsAt = isoDate;

const allocationSchema = z
  .object({ topic: z.string().trim().min(1).max(200), count: z.number().int().min(1).max(250) })
  .strict();

/**
 * A live test: a schedule, and either how many questions to draw per subcategory (bank) or the
 * questions themselves (upload). The link is made on the server.
 */
export const createCustomTestSchema = z
  .object({
    title: z.string().max(200),
    description: z.string().max(2000),
    examType: examTypeEnum,
    sourceMode: z.enum(["existing", "upload"]),
    durationMinutes: z.number().finite(),
    startsAt,
    expiresAt: isoDate,
    allocations: z.array(allocationSchema).max(100).default([]),
    questions: z.array(snapshotQuestionSchema).max(250).default([]),
  })
  .strict()
  .superRefine((test, ctx) => {
    if (test.sourceMode === "existing" && test.questions.length > 0)
      ctx.addIssue({ code: "custom", path: ["questions"], message: "A bank test has no uploads." });
    if (test.sourceMode === "upload" && test.allocations.length > 0)
      ctx.addIssue({
        code: "custom",
        path: ["allocations"],
        message: "An upload has no allocations.",
      });
  });

export const republishCustomTestSchema = z
  .object({
    testId: z.string().uuid(),
    startsAt,
    expiresAt: isoDate,
    durationMinutes: z.number().finite(),
  })
  .strict();

export const importCustomTestQuestionsSchema = z
  .object({ testId: z.string().uuid(), topic: z.string().max(200), examType: examTypeSchema })
  .strict();

export const getAttemptSchema = z.object({ attemptId: z.string().uuid(), accessKey }).strict();

export const saveAnswerSchema = z
  .object({
    attemptId: z.string().uuid(),
    accessKey,
    questionId: z.string().uuid(),
    answer: z.string().max(1).nullable(),
    flagged: z.boolean(),
  })
  .strict();
