// What a plan on the upgrade page says it gives. The limits are read from the shared tier rules
// (the same numbers the database enforces), never typed in again here.
import { TIER_DAILY_LIMIT, TIER_SESSION_LIMIT, type Tier } from "./exam-rules";

const isTier = (name: string): name is Tier => name in TIER_SESSION_LIMIT;

export function planPerks(planName: string, durationDays: number): string {
  if (!isTier(planName)) return `${durationDays} days of access`;
  const daily = TIER_DAILY_LIMIT[planName];
  return `${daily === null ? "Unlimited" : daily} questions a day · up to ${TIER_SESSION_LIMIT[planName]} in one test`;
}
