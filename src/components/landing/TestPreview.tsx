import { Clock, Flag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A grey stand-in for a line of text. The preview shows layout, never invented content. */
function Bar({ className }: { className?: string }) {
  return <span className={cn("block h-2.5 rounded-full bg-muted", className)} />;
}

const OPTIONS = [
  { letter: "A", width: "w-4/5", selected: false },
  { letter: "B", width: "w-3/5", selected: true },
  { letter: "C", width: "w-2/3", selected: false },
  { letter: "D", width: "w-1/2", selected: false },
] as const;

/**
 * The anatomy of a test, drawn with the real interface components and grey bars where text goes:
 * the programme, the timer, the question navigator, the question, four options (one chosen) and the
 * actions. It shows no question, score or student, and is hidden from assistive technology; the
 * caption beside it says what it is.
 */
export function TestPreview({ caption }: { caption: string }) {
  return (
    <figure className="m-0">
      <div
        aria-hidden="true"
        inert
        className="flex flex-col gap-5 rounded-xl border bg-card p-4 shadow-md sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Badge variant="rn">RN</Badge>
            <Bar className="w-24" />
          </div>
          <span className="flex items-center gap-1.5 rounded-md bg-sunken px-2.5 py-1.5 font-mono text-sm font-medium tabular-nums text-foreground">
            <Clock className="size-3.5" />
            mm:ss
          </span>
        </div>

        <div className="flex gap-1.5">
          {Array.from({ length: 10 }, (_, index) => (
            <span
              key={index}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                index === 0 ? "bg-primary" : index < 3 ? "bg-primary/35" : "bg-muted",
              )}
            />
          ))}
        </div>

        <div className="flex flex-col gap-2.5 py-1">
          <Bar className="w-full" />
          <Bar className="w-11/12" />
          <Bar className="w-3/5" />
        </div>

        <div className="flex flex-col gap-2.5">
          {OPTIONS.map((option) => (
            <div
              key={option.letter}
              className={cn(
                "flex items-center gap-3 rounded-md border px-3 py-3",
                option.selected ? "border-primary bg-accent" : "border-border bg-card",
              )}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-sm text-xs font-semibold",
                  option.selected
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {option.letter}
              </span>
              <Bar className={cn(option.width, option.selected && "bg-primary/25")} />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <Button variant="ghost" size="sm" tabIndex={-1}>
            <Flag />
            Flag
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" tabIndex={-1}>
              Previous
            </Button>
            <Button size="sm" tabIndex={-1}>
              Next
            </Button>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-xs text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}
