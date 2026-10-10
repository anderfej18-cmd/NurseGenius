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
    source_question_id: z.string().uuid().nullable().optional(),
    source_kind: z.enum(["existing", "custom"]),
  })
  .strict();

export const createCustomTestSchema = z
  .object({
    title: z.string().max(200),
    description: z.string().max(2000),
    examType: examTypeSchema,
    sourceMode: z.enum(["existing", "upload"]),
    durationMinutes: z.number().finite(),
    expiresAt: isoDate,
    tokenHash,
    questions: z.array(snapshotQuestionSchema).max(250),
  })
  .strict();

export const republishCustomTestSchema = z
  .object({ testId: z.string().uuid(), tokenHash, expiresAt: isoDate })
  .strict();

export const importCustomTestQuestionsSchema = z
  .object({ testId: z.string().uuid(), topic: z.string().max(200), examType: examTypeSchema })
  .strict();
