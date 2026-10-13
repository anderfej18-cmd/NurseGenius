import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  text: string;
  options: { A: string; B: string; C: string; D: string };
  /** Shown only for questions the student has already finished; highlights the right option. */
  correct?: string | null;
  /** The student's own last answer, if known. */
  chosen?: string | null;
}

const LETTERS = ["A", "B", "C", "D"] as const;

/**
 * A question with its four options, read-only. When the answer is known the right option and the
 * student's wrong choice are marked with an icon and words as well as a tint, so colour is never the
 * only signal.
 */
export function QuestionPreview({ text, options, correct, chosen }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <p className="font-medium leading-relaxed">{text}</p>
      <ul className="flex flex-col gap-2 text-sm">
        {LETTERS.map((letter) => {
          const isRight = correct === letter;
          const isWrongChoice = chosen === letter && correct != null && chosen !== correct;
          return (
            <li
              key={letter}
              className={cn(
                "flex items-start gap-3 rounded-md border px-3 py-2.5",
                isRight
                  ? "border-success bg-success-soft"
                  : isWrongChoice
                    ? "border-destructive bg-destructive-soft"
                    : "border-border bg-card",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-sm text-xs font-semibold",
                  isRight
                    ? "bg-success text-success-foreground"
                    : isWrongChoice
                      ? "bg-destructive text-destructive-foreground"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {letter}
              </span>
              <span className="min-w-0 flex-1 leading-relaxed">
                <span className="sr-only">{letter}. </span>
                {options[letter]}
              </span>
              {isRight && (
                <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-success">
                  <CheckCircle2 aria-hidden="true" className="size-3.5" />
                  Correct answer
                </span>
              )}
              {isWrongChoice && (
                <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-destructive">
                  <XCircle aria-hidden="true" className="size-3.5" />
                  Your answer
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
