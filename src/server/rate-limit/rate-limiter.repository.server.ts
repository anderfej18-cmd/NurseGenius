import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import type { RateLimiter } from "./rate-limit";

const rowSchema = z.object({ allowed: z.boolean(), retry_after_seconds: z.number() });

/** The Postgres-backed limiter: one atomic call per hit, shared by every instance (ADR-0007). */
export class SupabaseRateLimiter implements RateLimiter {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async consume(bucket: string, limit: number, windowSeconds: number) {
    const { data, error } = await this.db.rpc("consume_rate_limit", {
      _bucket: bucket,
      _limit: limit,
      _window_seconds: windowSeconds,
    });
    if (error) throw error;
    const [row] = z.array(rowSchema).min(1).parse(data);
    return { allowed: row.allowed, retryAfterSeconds: row.retry_after_seconds };
  }
}
