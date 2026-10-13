import { CalendarClock, Clock3 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { getSharedTest } from "@/functions/custom-tests.functions";
import { countdownParts, countdownWords, secondsUntil } from "@/lib/shared-test-clock";
import { validateCredentials } from "@/lib/auth-forms";

type SharedTestState = Awaited<ReturnType<typeof getSharedTest>>;
type Info = NonNullable<SharedTestState["test"]>;
const when = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" });

function Summary({ info }: { info: Info }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={info.examType === "RM" ? "rm" : "rn"}>{info.examType}</Badge>
        <p className="text-sm text-muted-foreground">
          {info.questionCount} questions · {info.durationMinutes} minutes
        </p>
      </div>
      <div>
        <h1 className="text-3xl font-bold">{info.title}</h1>
        {info.description && (
          <p className="measure mt-3 text-muted-foreground">{info.description}</p>
        )}
      </div>
    </>
  );
}

/** Counts down to a moment on the server's clock and calls `onArrive` once when it is reached. */
function Countdown({ to, offset, onArrive }: { to: string; offset: number; onArrive: () => void }) {
  const [seconds, setSeconds] = useState(() => secondsUntil(to, offset, Date.now()));
  const arrived = useRef(false);
  useEffect(() => {
    const tick = () => setSeconds(secondsUntil(to, offset, Date.now()));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [to, offset]);
  useEffect(() => {
    if (seconds === 0 && !arrived.current) {
      arrived.current = true;
      onArrive();
    }
  }, [seconds, onArrive]);

  const { days, hours, minutes, seconds: s } = countdownParts(seconds);
  const cells: Array<[number, string]> = [
    [days, "days"],
    [hours, "hours"],
    [minutes, "minutes"],
    [s, "seconds"],
  ];
  return (
    <div>
      <p className="mb-2 text-sm text-muted-foreground">The test opens in</p>
      <div
        role="timer"
        aria-live="off"
        aria-label={`Opens in ${countdownWords(seconds)}`}
        className="flex gap-3"
      >
        {cells.map(([value, label]) => (
          <div
            key={label}
            className="flex min-w-16 flex-col items-center rounded-md bg-sunken px-3 py-2"
          >
            <span className="font-mono text-3xl font-semibold tabular-nums">
              {String(value).padStart(2, "0")}
            </span>
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * What a visitor sees at a test link before they are in: not open yet (a countdown), open (the email form
 * that starts their attempt), or closed. The state and the clock are the server's.
 */
export function TestGate({
  info,
  offset,
  defaultEmail,
  busy,
  onStart,
  onRefresh,
}: {
  info: SharedTestState;
  offset: number;
  defaultEmail: string;
  busy: boolean;
  onStart: (email: string) => void;
  /** Ask the server for the state again (the countdown reached zero). */
  onRefresh: () => void;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => setEmail(defaultEmail), [defaultEmail]);

  if (info.state === "closed" || info.test === null) {
    return (
      <EmptyState
        icon={Clock3}
        title={info.test ? `“${info.test.title}” is closed` : "This test link has expired"}
        description={
          info.test
            ? `It closed on ${when.format(new Date(info.test.expiresAt))}. Ask the test administrator for a new link.`
            : "Ask the test administrator for a new link."
        }
      />
    );
  }

  if (info.state === "upcoming") {
    return (
      <Card className="flex flex-col gap-6 p-6 md:p-8">
        <Summary info={info.test} />
        <Countdown to={info.test.startsAt} offset={offset} onArrive={onRefresh} />
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarClock aria-hidden="true" className="size-4 shrink-0" />
          Opens {when.format(new Date(info.test.startsAt))}. Keep this page open, or come back then.
        </p>
      </Card>
    );
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const problem = validateCredentials({ email, password: "x" }, "signin").email;
    setError(problem ?? null);
    if (problem) {
      field.current?.focus();
      return;
    }
    onStart(email);
  };

  return (
    <Card className="flex flex-col gap-5 p-6 md:p-8">
      <Summary info={info.test} />
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
        <li>The test is open until {when.format(new Date(info.test.expiresAt))}.</li>
        <li>
          Your {info.test.durationMinutes} minutes start when you press Start test. Your answers are
          saved as you go, and the test is submitted for you when the time ends.
        </li>
        <li>Correct answers and explanations appear after you submit.</li>
        <li>AI help is available only after you sign in and save your result to an account.</li>
      </ul>
      <form noValidate className="flex flex-col gap-4" onSubmit={submit}>
        <Field
          label="Email address"
          hint="Your result is recorded against this address. The test's owner sees only a partly hidden version of it."
          error={error}
          required
        >
          {(control) => (
            <Input
              {...control}
              ref={field}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          )}
        </Field>
        <div>
          <Button size="lg" type="submit" loading={busy}>
            Start test
          </Button>
        </div>
      </form>
    </Card>
  );
}
