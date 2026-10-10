import { LimitReachedError } from "@/lib/app-errors";
import { TIER_DAILY_LIMIT, TIER_SESSION_LIMIT, type Tier } from "@/lib/exam-rules";
import type { Quota } from "./session.types";

/** The tier the student gets today: a paid tier past its expiry counts as novice. */
export function effectiveTier(quota: Quota, now: Date): Tier {
  const expired = quota.expiryDate !== null && new Date(quota.expiryDate).getTime() < now.getTime();
  return expired ? "novice" : quota.tier;
}

/** Questions started today (UTC day); a counter left over from an earlier day counts as zero. */
export function questionsUsedToday(quota: Quota, now: Date): number {
  return quota.lastQuestionDate === now.toISOString().slice(0, 10) ? quota.questionsToday : 0;
}

/** Questions the student may still start today; null when the tier has no daily cap. */
export function remainingToday(quota: Quota, now: Date): number | null {
  const cap = TIER_DAILY_LIMIT[effectiveTier(quota, now)];
  return cap === null ? null : Math.max(0, cap - questionsUsedToday(quota, now));
}

/** Refuses a session of `count` questions that the student's tier does not allow today. */
export function assertWithinTierLimits(quota: Quota, count: number, now: Date): void {
  const tier = effectiveTier(quota, now);
  const sessionCap = TIER_SESSION_LIMIT[tier];
  if (count > sessionCap)
    throw new LimitReachedError(`${tier} tier allows max ${sessionCap} questions per quiz.`);

  const remaining = remainingToday(quota, now);
  if (remaining === null) return;
  if (remaining <= 0)
    throw new LimitReachedError(
      "You've hit your daily limit. Upgrade your tier or come back tomorrow.",
    );
  if (count > remaining)
    throw new LimitReachedError(`Only ${remaining} questions left today on your tier.`);
}
