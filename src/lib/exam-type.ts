import { z } from "zod";

/** The exams the platform prepares students for. The one definition; schemas and types derive from it. */
export const examTypeSchema = z.enum(["RN", "RM"]);
export type ExamType = z.infer<typeof examTypeSchema>;
