import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTheme } from "@/hooks/theme-context";
import { parseThemePreference, type ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string; icon: LucideIcon }> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/**
 * Light / Dark / System as a labelled segmented control. It lives inside the signed-in application
 * only; public pages are always light. Choosing an option saves it on this device and applies it
 * at once. Pressing the chosen option again keeps it chosen.
 */
export function ThemeControl({
  className,
  compact = false,
}: {
  className?: string;
  /** Icons only, with the words kept for assistive technology. For a crowded toolbar. */
  compact?: boolean;
}) {
  const { preference, setPreference } = useTheme();
  return (
    <ToggleGroup
      type="single"
      value={preference}
      onValueChange={(next) => {
        // Radix reports "" when the pressed option is pressed again; a theme cannot be unset.
        if (next) setPreference(parseThemePreference(next));
      }}
      aria-label="Colour theme"
      className={cn("inline-flex gap-0.5 rounded-md bg-muted p-0.5", className)}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <ToggleGroupItem
          key={value}
          value={value}
          aria-label={compact ? label : undefined}
          className="h-8 rounded-sm px-2.5 data-[state=on]:bg-raised data-[state=on]:text-foreground data-[state=on]:shadow-sm pointer-coarse:h-10"
        >
          <Icon />
          <span className={compact ? "sr-only" : undefined}>{label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
