import { describe, expect, it, vi } from "vitest";
import { LimitReachedError } from "../errors";
import { enforceLimits } from "./rate-limit";

const limiter = (results: Array<{ allowed: boolean; retryAfterSeconds: number }>) => ({
  consume: vi.fn(
    async (_bucket: string, _limit: number, _window: number) =>
      results.shift() ?? { allowed: true, retryAfterSeconds: 0 },
  ),
});
const rule = (bucket: string) => ({ bucket, limit: 3, windowSeconds: 60 });

describe("enforceLimits", () => {
  it("passes when every rule is within its limit, checking them all", async () => {
    const l = limiter([]);
    await enforceLimits(l, [rule("a"), rule("b")]);
    expect(l.consume.mock.calls.map(([bucket]) => bucket)).toEqual(["a", "b"]);
  });

  it("stops at the first rule that is used up and says how long to wait", async () => {
    const l = limiter([
      { allowed: true, retryAfterSeconds: 0 },
      { allowed: false, retryAfterSeconds: 130 },
    ]);
    const error = await enforceLimits(l, [rule("a"), rule("b"), rule("c")]).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(LimitReachedError);
    expect((error as Error).message).toBe("Too many attempts. Please try again in 3 minutes.");
    expect(l.consume).toHaveBeenCalledTimes(2);
  });

  it("speaks of seconds when the wait is under a minute", async () => {
    const l = limiter([{ allowed: false, retryAfterSeconds: 20 }]);
    await expect(enforceLimits(l, [rule("a")])).rejects.toThrow(
      "Too many attempts. Please try again in 20 seconds.",
    );
  });
});
