import { cn } from "@/lib/utils";

export type ConfidenceLevel = "low" | "medium" | "high";

const LEVELS: ReadonlyArray<{ value: ConfidenceLevel; label: string }> = [
  { value: "low", label: "Guessing" },
  { value: "medium", label: "Fairly sure" },
  { value: "high", label: "Certain" },
];

/** "How sure are you?" for the question on screen. Optional, and never affects the score. */
export function ConfidencePicker({
  value,
  onChange,
}: {
  value: ConfidenceLevel | null;
  onChange: (level: ConfidenceLevel) => void;
}) {
  return (
    <div role="group" aria-label="How sure are you of your answer?" className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        How sure are you? Optional, and it never changes your score.
      </p>
      <div className="inline-flex w-full gap-1 rounded-md bg-muted p-1 sm:w-fit">
        {LEVELS.map((level) => (
          <button
            key={level.value}
            type="button"
            aria-pressed={value === level.value}
            onClick={() => onChange(level.value)}
            className={cn(
              "h-9 flex-1 rounded-sm px-4 text-sm font-medium focus-ring pointer-coarse:h-11 sm:flex-none",
              value === level.value
                ? "bg-raised text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {level.label}
          </button>
        ))}
      </div>
    </div>
  );
}
