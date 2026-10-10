interface Props {
  text: string;
  options: { A: string; B: string; C: string; D: string };
  /** Shown only for questions the student has already finished; highlights the right option. */
  correct?: string | null;
  /** The student's own last answer, if known. */
  chosen?: string | null;
}

const LETTERS = ["A", "B", "C", "D"] as const;

export function QuestionPreview({ text, options, correct, chosen }: Props) {
  return (
    <div className="space-y-2">
      <p className="font-medium leading-relaxed">{text}</p>
      <ul className="space-y-1 text-sm">
        {LETTERS.map((letter) => {
          const isRight = correct === letter;
          const isWrongChoice = chosen === letter && correct != null && chosen !== correct;
          return (
            <li
              key={letter}
              className={`rounded-md border px-3 py-2 ${
                isRight
                  ? "border-success bg-success/10"
                  : isWrongChoice
                    ? "border-destructive bg-destructive/10"
                    : "border-border"
              }`}
            >
              <span className="font-semibold mr-2">{letter}.</span>
              {options[letter]}
              {isRight && <span className="sr-only"> (correct answer)</span>}
              {isWrongChoice && <span className="sr-only"> (your answer)</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
