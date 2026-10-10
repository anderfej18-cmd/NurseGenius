import { z } from "zod";

export const listNotificationsSchema = z
  .object({
    unreadOnly: z.boolean().optional(),
    limit: z.number().int().min(1).max(50).optional(),
    offset: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();

/** No ids means every unread notification. The student is never named; it comes from the token. */
export const markNotificationsReadSchema = z
  .object({ ids: z.array(z.string().uuid()).min(1).max(100).optional() })
  .strict();
