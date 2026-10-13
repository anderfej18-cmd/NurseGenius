import { cn } from "@/lib/utils";
import { OPTION_LETTERS, type OptionLetter } from "@/lib/exam-runtime";

/**
 * The four answers of a question as large buttons. Choosing is instant (no transition: this is the most
 * repeated action in the product and often done from the keyboard). Each option is a button that is
 * "pressed" when chosen, so a screen reader hears "A. ..., pressed"; Tab moves between them and Enter or
 * Space chooses, so moving focus never changes an answer by accident.
 */
export function OptionList({
  options,
  selected,
  onSelect,
}: {
  options: Readonly<Record<OptionLetter, string | null>>;
  selected: string | null;
  onSelect: (letter: OptionLetter) => void;
}) {
  return (
    <div role="group" aria-label="Answer options" className="flex flex-col gap-3">
      {OPTION_LETTERS.map((letter) => {
        const chosen = selected === letter;
        return (
          <button
            key={letter}
            type="button"
            aria-pressed={chosen}
            onClick={() => onSelect(letter)}
            className={cn(
              "flex min-h-14 w-full items-start gap-4 rounded-md border px-4 py-3.5 text-left text-base focus-ring",
              chosen
                ? "border-primary bg-accent text-foreground"
                : "border-border bg-card text-foreground hover:border-input hover:bg-sunken",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-sm text-sm font-semibold",
                chosen ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {letter}
            </span>
            <span className="min-w-0 flex-1 leading-relaxed">
              <span className="sr-only">{letter}. </span>
              {options[letter]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
