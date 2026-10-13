import { Search } from "lucide-react";
import { useId, useMemo, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { ALL_AREAS } from "@/lib/exam-rules";
import type { ExamType } from "@/lib/exam-type";
import {
  COUNT_STEP,
  MINUTES_RANGE,
  MINUTES_STEP,
  countRange,
  filterTopics,
  pacingNote,
  programmeSummaryText,
} from "@/lib/start-flow";
import { SELECTION_CHOICES, SELECTION_LABELS, type SelectionMode } from "@/lib/session-modes";
import { cn } from "@/lib/utils";

/** One numbered step of the start screen: a real sequence, so it is numbered. */
export function StepSection({
  number,
  title,
  description,
  children,
}: {
  number: number;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <header className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-sm bg-primary font-mono text-sm font-semibold text-primary-foreground"
        >
          {number}
        </span>
        <div>
          <h2 id={headingId} className="font-sans text-lg font-semibold tracking-normal">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
      </header>
      <div className="md:pl-10">{children}</div>
    </section>
  );
}

export type CountsState =
  | { status: "loading" }
  | { status: "error"; message: string; retry: () => void }
  | { status: "ready"; counts: Record<string, number> };

const PROGRAMMES: ReadonlyArray<{ value: ExamType; name: string; tone: "rn" | "rm" }> = [
  { value: "RN", name: "Registered Nurse", tone: "rn" },
  { value: "RM", name: "Registered Midwife", tone: "rm" },
];

/** Step 1: RN or RM, each showing how much the bank holds for it. */
export function ProgrammeStep({
  value,
  onChange,
  states,
}: {
  value: ExamType;
  onChange: (value: ExamType) => void;
  states: Record<ExamType, CountsState>;
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onChange(next as ExamType)}
      aria-label="Programme"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
    >
      {PROGRAMMES.map((programme) => {
        const id = `programme-${programme.value}`;
        const state = states[programme.value];
        return (
          <label
            key={programme.value}
            htmlFor={id}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-md border bg-card p-4 pointer-coarse:min-h-11",
              value === programme.value &&
                (programme.tone === "rn" ? "border-rn bg-rn-soft" : "border-rm bg-rm-soft"),
            )}
          >
            <RadioGroupItem id={id} value={programme.value} className="mt-1" />
            <span className="flex flex-col gap-0.5">
              <span
                className={cn(
                  "font-display text-2xl font-bold",
                  programme.tone === "rn" ? "text-rn-text" : "text-rm-text",
                )}
              >
                {programme.value}
              </span>
              <span className="text-sm font-medium text-foreground">{programme.name}</span>
              <span className="text-xs text-muted-foreground">
                {state.status === "ready"
                  ? programmeSummaryText(state.counts)
                  : state.status === "loading"
                    ? "Counting questions…"
                    : "Could not count questions"}
              </span>
            </span>
          </label>
        );
      })}
    </RadioGroup>
  );
}

/** Step 2: every topic with its question count, searchable, or all areas at once. */
export function TopicStep({
  state,
  value,
  onChange,
}: {
  state: CountsState;
  value: string;
  onChange: (topic: string) => void;
}) {
  const [query, setQuery] = useState("");
  const searchId = useId();
  const options = useMemo(
    () => (state.status === "ready" ? filterTopics(state.counts, query) : []),
    [state, query],
  );

  if (state.status === "loading")
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  if (state.status === "error")
    return (
      <Alert variant="destructive">
        <p>{state.message}</p>
        <div>
          <Button size="sm" variant="outline" onClick={state.retry}>
            Try again
          </Button>
        </div>
      </Alert>
    );

  const total = Object.values(state.counts).reduce((sum, n) => sum + n, 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <label htmlFor={searchId} className="sr-only">
          Search topics
        </label>
        <Search
          aria-hidden="true"
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id={searchId}
          type="search"
          placeholder="Search topics"
          className="pl-9"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
        />
      </div>
      <RadioGroup
        value={value}
        onValueChange={onChange}
        aria-label="Topic"
        className="flex max-h-72 flex-col gap-1.5 overflow-y-auto rounded-md border bg-card p-2"
      >
        {query.trim() === "" && (
          <TopicRow
            id="topic-all"
            value={ALL_AREAS}
            label="All areas"
            total={total}
            active={value === ALL_AREAS}
          />
        )}
        {options.map(({ topic, total: count }) => (
          <TopicRow
            key={topic}
            id={`topic-${topic}`}
            value={topic}
            label={topic}
            total={count}
            active={value === topic}
          />
        ))}
        {options.length === 0 && (
          <p className="px-2 py-3 text-sm text-muted-foreground" role="status">
            {query.trim() === ""
              ? "There are no questions in this programme yet."
              : `No topic matches "${query.trim()}".`}
          </p>
        )}
      </RadioGroup>
    </div>
  );
}

function TopicRow({
  id,
  value,
  label,
  total,
  active,
}: {
  id: string;
  value: string;
  label: string;
  total: number;
  active: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-sm px-3 py-2.5 text-sm hover:bg-sunken pointer-coarse:min-h-11",
        active && "bg-accent text-accent-foreground hover:bg-accent",
      )}
    >
      <RadioGroupItem id={id} value={value} />
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {total.toLocaleString("en-GB")}
      </span>
    </label>
  );
}

/** Step 3: how questions are chosen, from the product's own list, or the fixed "similar" choice. */
export function SelectionStep({
  value,
  onChange,
  similar,
}: {
  value: SelectionMode;
  onChange: (value: SelectionMode) => void;
  similar: boolean;
}) {
  if (similar)
    return (
      <p className="rounded-md bg-sunken px-4 py-3 text-sm">
        <span className="font-medium">{SELECTION_LABELS.similar.label}.</span>{" "}
        {SELECTION_LABELS.similar.hint}
      </p>
    );
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onChange(next as SelectionMode)}
      aria-label="How questions are chosen"
      className="flex flex-col gap-2"
    >
      {SELECTION_CHOICES.map((mode) => {
        const id = `selection-${mode}`;
        return (
          <label
            key={mode}
            htmlFor={id}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-md border bg-card p-3.5 pointer-coarse:min-h-11",
              value === mode && "border-primary bg-accent",
            )}
          >
            <RadioGroupItem id={id} value={mode} className="mt-0.5" />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{SELECTION_LABELS[mode].label}</span>
              <span className="text-xs text-muted-foreground">{SELECTION_LABELS[mode].hint}</span>
            </span>
          </label>
        );
      })}
    </RadioGroup>
  );
}

/** Step 4: how many questions and how many minutes, within the plan's limits. */
export function SizeStep({
  count,
  minutes,
  sessionLimit,
  onCount,
  onMinutes,
}: {
  count: number;
  minutes: number;
  sessionLimit: number;
  onCount: (value: number) => void;
  onMinutes: (value: number) => void;
}) {
  const { min, max } = countRange(sessionLimit);
  const note = pacingNote(count, minutes);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <span id="count-label" className="text-sm font-medium">
            Questions
          </span>
          <span className="font-mono text-sm font-semibold tabular-nums">{count}</span>
        </div>
        <Slider
          aria-labelledby="count-label"
          value={[count]}
          min={min}
          max={max}
          step={min === max ? 1 : COUNT_STEP}
          disabled={min === max}
          onValueChange={(next) => onCount(next[0])}
        />
        <p className="text-xs text-muted-foreground">
          Up to {max} for your plan, in steps of {COUNT_STEP}.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <span id="minutes-label" className="text-sm font-medium">
            Time
          </span>
          <span className="font-mono text-sm font-semibold tabular-nums">{minutes} minutes</span>
        </div>
        <Slider
          aria-labelledby="minutes-label"
          value={[minutes]}
          min={MINUTES_RANGE.min}
          max={MINUTES_RANGE.max}
          step={MINUTES_STEP}
          onValueChange={(next) => onMinutes(next[0])}
        />
        <p className="text-xs text-muted-foreground">
          From {MINUTES_RANGE.min} to {MINUTES_RANGE.max} minutes.
        </p>
      </div>
      {note && <Alert variant="info">{note}</Alert>}
    </div>
  );
}
