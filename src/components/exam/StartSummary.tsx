import { Check } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Allowance, AllowanceNote } from "@/lib/start-flow";
import { submitLockedText } from "@/lib/exam-runtime";
import { MAX_SESSION_MINUTES } from "@/lib/exam-rules";

export interface StartChoice {
  programme: string;
  topic: string;
  selection: string;
  count: number;
  minutes: number;
}

/**
 * The test about to start, the rules it follows, and the button. It sits beside the steps on a wide
 * screen and below them on a phone. Every rule listed is one the app really applies.
 */
export function StartSummary({
  choice,
  allowance,
  allowanceNote,
  error,
  errorCode,
  busy,
  disabledReason,
  onStart,
}: {
  choice: StartChoice;
  allowance: Allowance;
  allowanceNote: AllowanceNote | null;
  error: string | null;
  errorCode: string | null;
  busy: boolean;
  /** Why the button is off, when it is; shown beside it. */
  disabledReason: string | null;
  onStart: () => void;
}) {
  const rows: Array<[string, string]> = [
    ["Programme", choice.programme],
    ["Topic", choice.topic],
    ["Questions chosen", choice.selection],
    ["Size", `${choice.count} questions in ${choice.minutes} minutes`],
  ];
  return (
    <Card className="flex flex-col gap-5 p-5">
      <h2 className="font-sans text-lg font-semibold tracking-normal">Your test</h2>
      <dl className="flex flex-col gap-3 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-2 border-t border-divider pt-4">
        <h3 className="text-sm font-semibold">Before you start</h3>
        <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
          {[
            "The timer runs on the server. When time is up the test is submitted for you.",
            "Correct answers and explanations appear after you submit, not before.",
            submitLockedText(choice.count),
            allowance.limit === null
              ? "Your plan has no daily question limit."
              : `You have used ${allowance.used} of ${allowance.limit} questions today.`,
            `A test can run for up to ${MAX_SESSION_MINUTES} minutes.`,
          ].map((rule) => (
            <li key={rule} className="flex gap-2">
              <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              {rule}
            </li>
          ))}
        </ul>
      </div>

      {allowanceNote && <Alert variant={allowanceNote.tone}>{allowanceNote.text}</Alert>}
      {error && (
        <Alert variant="destructive">
          <p>{error}</p>
          {errorCode === "LIMIT_REACHED" && (
            <p>
              <Link to="/payments" className="font-medium underline underline-offset-4">
                See plans with higher limits
              </Link>
            </p>
          )}
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Button
          size="lg"
          className="w-full"
          loading={busy}
          disabled={disabledReason !== null}
          onClick={onStart}
        >
          Begin test
        </Button>
        {disabledReason && <p className="text-xs text-muted-foreground">{disabledReason}</p>}
      </div>
    </Card>
  );
}
