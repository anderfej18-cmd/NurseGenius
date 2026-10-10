import { LimitReachedError } from "../errors";

/** The shared fixed-window counter (ADR-0007). Declared here, beside the code that uses it. */
export interface RateLimiter {
  consume(
    bucket: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
}

export interface LimitRule {
  readonly bucket: string;
  readonly limit: number;
  readonly windowSeconds: number;
}

/** Counts one hit against each rule in turn and refuses, with the wait, at the first one that is used up. */
export async function enforceLimits(
  limiter: RateLimiter,
  rules: readonly LimitRule[],
): Promise<void> {
  for (const { bucket, limit, windowSeconds } of rules) {
    const result = await limiter.consume(bucket, limit, windowSeconds);
    if (!result.allowed) {
      throw new LimitReachedError(
        `Too many attempts. Please try again in ${waitText(result.retryAfterSeconds)}.`,
      );
    }
  }
}

function waitText(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}
