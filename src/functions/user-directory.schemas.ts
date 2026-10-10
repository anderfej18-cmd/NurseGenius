import { z } from "zod";

export const userDirectorySchema = z
  .object({
    limit: z.number().int().min(1).max(50).optional(),
    offset: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();
