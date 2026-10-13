import { Send, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { clockFace, submitLockedText } from "@/lib/exam-runtime";
import { cn } from "@/lib/utils";

/**
 * The bar that stays on screen while a test runs: where you are, the time left, how much is answered,
 * and Submit. The timer is announced as a role, and the warnings at ten, five and one minute left
 * go to a polite status region so they are heard without interrupting.
 */
export function ExamHeader({
  position,
  total,
  answered,
  remaining,
  canSubmit,
  announcement,
  lockedText,
  onSubmit,
}: {
  position: number;
  total: number;
  answered: number;
  remaining: number;
  canSubmit: boolean;
  /** The latest time warning, or an empty string. */
  announcement: string;
  /** Why Submit is locked, when a screen has its own rule; the exam rule is the default. */
  lockedText?: string;
  onSubmit: () => void;
}) {
  const { minutes, seconds } = clockFace(remaining);
  const low = remaining < 300;
  return (
    <header className="sticky top-0 z-30 border-b bg-background">
      <div className="mx-auto flex h-14 w-full max-w-[1100px] items-center justify-between gap-3 gutter">
        <div className="min-w-0 whitespace-nowrap">
          <p className="text-xs text-muted-foreground">
            <span className="max-sm:sr-only">Question </span>
            {position} of {total}
          </p>
          <p className="text-sm font-medium">{answered} answered</p>
        </div>
        <div
          role="timer"
          aria-label="Time left"
          className={cn(
            "flex items-center gap-2 rounded-md bg-sunken px-2.5 py-1.5 font-mono text-base font-semibold tabular-nums sm:px-3 sm:text-lg",
            low ? "text-destructive" : "text-foreground",
          )}
        >
          <Timer aria-hidden="true" className="size-4" />
          {minutes}:{seconds}
        </div>
        <Button
          size="sm"
          disabled={!canSubmit}
          onClick={onSubmit}
          aria-describedby={canSubmit ? undefined : "submit-lock"}
        >
          <Send className="max-sm:hidden" />
          Submit
        </Button>
      </div>
      <Progress
        value={total === 0 ? 0 : (answered / total) * 100}
        aria-label="Questions answered"
        className="h-1 rounded-none"
      />
      {!canSubmit && (
        <p
          id="submit-lock"
          className="mx-auto w-full max-w-[1100px] px-4 py-1.5 text-center text-xs text-muted-foreground sm:px-8"
        >
          {lockedText ?? submitLockedText(total)}
        </p>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </header>
  );
}
