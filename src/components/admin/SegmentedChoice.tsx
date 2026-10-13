import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/**
 * A labelled either-or choice shown as a segmented control (two to four short options). Pressing the
 * chosen option again keeps it chosen.
 */
export function SegmentedChoice<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => {
        // Radix reports "" when the pressed option is pressed again; a choice cannot be unset.
        const chosen = options.find((option) => option.value === next);
        if (chosen) onChange(chosen.value);
      }}
      aria-label={label}
      className="inline-flex w-fit max-w-full flex-wrap justify-start gap-0.5 rounded-md bg-muted p-0.5"
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className="h-8 rounded-sm px-3 data-[state=on]:bg-raised data-[state=on]:text-foreground data-[state=on]:shadow-sm pointer-coarse:h-10"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
