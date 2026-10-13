import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  /** What belongs here, as a plain statement ("No tests yet"). */
  title: string;
  /** Why it is empty and what the person can do about it. */
  description?: ReactNode;
  /** The one next step: a Button or a link styled as one. */
  action?: ReactNode;
  className?: string;
}

/**
 * Shown where a list or panel has nothing to show. It never contains made-up records: it says what
 * would live here and offers one next action. Also used for "could not load" with a retry action.
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-dashed bg-card px-6 py-10 text-center",
        className,
      )}
    >
      {Icon && (
        <span className="flex size-11 items-center justify-center rounded-md bg-accent text-accent-foreground">
          <Icon aria-hidden="true" className="size-5" />
        </span>
      )}
      <div className="flex flex-col gap-1">
        <p className="font-medium text-foreground">{title}</p>
        {description && (
          <p className="measure mx-auto text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
