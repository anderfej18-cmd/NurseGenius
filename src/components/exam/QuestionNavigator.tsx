import { Flag } from "lucide-react";
import { navigatorLabel, type ItemFlags } from "@/lib/exam-runtime";
import { cn } from "@/lib/utils";

/**
 * Every question as a numbered cell: answered cells are tinted, flagged ones carry a flag mark, the
 * current one is outlined. State is conveyed by the label, the flag icon and the tint together, never
 * by colour alone. Choosing a cell moves to that question.
 */
export function QuestionNavigator({
  items,
  current,
  onSelect,
}: {
  items: readonly ItemFlags[];
  current: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <ol className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-5">
        {items.map((item, index) => {
          const isCurrent = index === current;
          return (
            <li key={index}>
              <button
                type="button"
                onClick={() => onSelect(index)}
                aria-label={navigatorLabel(index, item, isCurrent)}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "relative flex h-10 w-full items-center justify-center rounded-sm border text-sm font-medium tabular-nums focus-ring pointer-coarse:h-11",
                  isCurrent && "border-primary bg-primary text-primary-foreground",
                  !isCurrent &&
                    item.answered &&
                    "border-transparent bg-accent text-accent-foreground",
                  !isCurrent &&
                    !item.answered &&
                    "border-border bg-card text-muted-foreground hover:bg-sunken",
                )}
              >
                {index + 1}
                {item.flagged && (
                  <Flag
                    aria-hidden="true"
                    className={cn(
                      "absolute -right-1 -top-1 size-3.5 rounded-full bg-card p-px",
                      isCurrent ? "text-primary" : "text-warning",
                    )}
                    fill="currentColor"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ol>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-3 rounded-sm bg-accent" />
          Answered
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-3 rounded-sm border bg-card" />
          Not answered
        </li>
        <li className="flex items-center gap-1.5">
          <Flag aria-hidden="true" className="size-3 text-warning" fill="currentColor" />
          Flagged
        </li>
      </ul>
    </div>
  );
}
