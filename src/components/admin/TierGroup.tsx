import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { TIER_LABEL, type Tier } from "@/lib/exam-rules";
import { tierAllowance } from "@/lib/admin-view";

/**
 * One subscription tier in a user list: its name, how many people hold it and what it allows, folded
 * open or shut with the keyboard or a tap. The count is the tier's real total, which can be more than
 * the rows loaded so far.
 */
export function TierGroup({
  tier,
  count,
  children,
}: {
  tier: Tier;
  count: ReactNode;
  children: ReactNode;
}) {
  return (
    <details open className="group rounded-lg border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 focus-ring [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block font-medium">
            {TIER_LABEL[tier]} <span className="tabular-nums text-muted-foreground">({count})</span>
          </span>
          <span className="block text-sm text-muted-foreground">{tierAllowance(tier)}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
        />
      </summary>
      <div className="border-t border-divider">{children}</div>
    </details>
  );
}
