import { z } from "zod";

/** For functions that take no input: any field, notably a user id, is rejected. */
export const emptySchema = z.object({}).strict();
