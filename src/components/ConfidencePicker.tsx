import { Button } from "@/components/ui/button";

export type ConfidenceLevel = "low" | "medium" | "high";

const LEVELS: ReadonlyArray<{ value: ConfidenceLevel; label: string }> = [
  { value: "low", label: "Guessing" },
  { value: "medium", label: "Fairly sure" },
  { value: "high", label: "Certain" },
];

interface Props {
  value: ConfidenceLevel | null;
  onChange: (level: ConfidenceLevel) => void;
}

/** "How sure are you?" for the question on screen. Optional, and never affects the score. */
export function ConfidencePicker({ value, onChange }: Props) {
  return (
    <div className="mt-6" role="group" aria-label="How sure are you of your answer?">
      <p className="text-sm text-muted-foreground mb-2">How sure are you? (optional)</p>
      <div className="flex gap-2">
        {LEVELS.map((level) => (
          <Button
            key={level.value}
            type="button"
            size="sm"
            variant={value === level.value ? "default" : "outline"}
            aria-pressed={value === level.value}
            onClick={() => onChange(level.value)}
          >
            {level.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
