import { z } from "zod";

export const leaderboardSchema = z.object({ period: z.enum(["daily", "weekly"]) }).strict();
