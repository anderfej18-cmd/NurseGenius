import { z } from "zod";
import { examTypeSchema } from "@/lib/exam-type";

const text = z.string().trim().min(1).max(200);

const filterShape = {
  examType: examTypeSchema,
  topics: z.array(text).max(50).optional(),
  subtopicIds: z.array(z.string().uuid()).max(50).optional(),
  yearFrom: z.number().int().min(1900).max(2100).optional(),
  yearTo: z.number().int().min(1900).max(2100).optional(),
  difficulty: z
    .array(z.enum(["easy", "medium", "hard"]))
    .max(3)
    .optional(),
};

const pageShape = {
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(500).optional(),
};

export const listQuestionsSchema = z.object({ ...filterShape, ...pageShape }).strict();

export const adminListQuestionsSchema = z
  .object({ ...filterShape, ...pageShape, status: z.enum(["active", "retired", "all"]).optional() })
  .strict();

export const topicCountsSchema = z.object({ examType: examTypeSchema }).strict();

// ---- Admin content management ----
// Content fields are only bounded here (blank allowed): which parts of a question are missing is a
// business rule the service reports per question, so an import says "Question 7 is missing Option C".

const questionContentSchema = z
  .object({
    question_text: z.string().max(5000),
    option_a: z.string().max(1000),
    option_b: z.string().max(1000),
    option_c: z.string().max(1000),
    option_d: z.string().max(1000),
    correct_answer: z.string().max(5),
    rationale: z.string().max(5000).nullable().default(null),
  })
  .strict();

const topicSchema = z.string().trim().min(1).max(200);

export const adminCreateQuestionSchema = z
  .object({ examType: examTypeSchema, topic: topicSchema, content: questionContentSchema })
  .strict();

export const adminImportQuestionsSchema = z
  .object({
    examType: examTypeSchema,
    topic: topicSchema,
    questions: z.array(questionContentSchema).min(1).max(500),
  })
  .strict();

export const adminUpdateQuestionSchema = z
  .object({
    questionId: z.string().uuid(),
    content: questionContentSchema.optional(),
    difficulty: z.enum(["easy", "medium", "hard"]).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
    source: z.string().trim().min(1).max(200).nullable().optional(),
    subtopicId: z.string().uuid().nullable().optional(),
  })
  .strict();

export const questionIdSchema = z.object({ questionId: z.string().uuid() }).strict();

export const adminListSubtopicsSchema = z
  .object({ examType: examTypeSchema, topic: topicSchema.optional() })
  .strict();

export const adminCreateSubtopicSchema = z
  .object({ examType: examTypeSchema, topic: topicSchema, name: z.string().max(200) })
  .strict();

export const adminRenameSubtopicSchema = z
  .object({ subtopicId: z.string().uuid(), name: z.string().max(200) })
  .strict();

export const subtopicIdSchema = z.object({ subtopicId: z.string().uuid() }).strict();
