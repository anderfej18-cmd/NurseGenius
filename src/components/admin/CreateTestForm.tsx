import { Radio } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ExamTypeField } from "@/components/admin/ExamTypeField";
import { ScheduleFields } from "@/components/admin/ScheduleFields";
import { SegmentedChoice } from "@/components/admin/SegmentedChoice";
import { Section } from "@/components/app/Section";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { createCustomTest } from "@/functions/custom-tests.functions";
import { fetchTopicCounts } from "@/hooks/topic-data";
import { useServerData } from "@/hooks/use-server-data";
import {
  CUSTOM_TEST_LIMITS,
  type Allocation,
  type CustomTestDraft,
  type Schedule,
  defaultSchedule,
  hasErrors,
  questionCountOf,
  sampleQuestions,
  validateCustomTest,
  windowEnd,
} from "@/lib/custom-test-form";
import type { ExamType } from "@/lib/exam-type";
import { type ParsedQuestion, describeProblems, inspectQuestionText } from "@/lib/question-import";

type Mode = "existing" | "upload";
/** What the file turned out to hold: the questions that will be used, and what was found. */
interface FileState {
  questions: ParsedQuestion[];
  /** Valid questions in the file before any random cut to the maximum. */
  validInFile: number;
  problems: string;
}
const DEFAULT_COUNT = 10;

/** Everything left to fix before the test can go live, as short sentences, in reading order. */
function remaining(errors: ReturnType<typeof validateCustomTest>): string[] {
  const { counts, ...rest } = errors;
  return [...Object.values(rest), ...Object.entries(counts ?? {}).map(([t, m]) => `${t}: ${m}`)];
}

/**
 * Builds a live test from bank questions (a count per subcategory, drawn at random by the database) or
 * from an uploaded file, schedules it, and publishes it behind a private link. "Go live" is enabled only
 * when nothing is wrong, and what is wrong is listed beside it.
 */
export function CreateTestForm({
  onCreated,
}: {
  onCreated: (testId: string, token: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("existing");
  const [examType, setExamType] = useState<ExamType>("RN");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [chosen, setChosen] = useState<Record<string, number>>({});
  const [file, setFile] = useState<FileState | null>(null);
  const [schedule, setSchedule] = useState<Schedule>(() => defaultSchedule(new Date()));
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const topics = useServerData(() => fetchTopicCounts(examType), [examType]);
  const available = topics.data ?? {};

  const allocations: Allocation[] = Object.entries(chosen).map(([topic, count]) => ({
    topic,
    count,
    available: available[topic] ?? 0,
  }));
  const draft: CustomTestDraft = {
    ...schedule,
    title,
    mode,
    allocations,
    uploadedCount: file?.questions.length ?? 0,
  };
  const errors = validateCustomTest(draft, new Date());
  const count = questionCountOf(draft);
  const todo = remaining(errors);

  const changeExam = (next: ExamType) => {
    setExamType(next);
    setChosen({});
  };
  const toggle = (topic: string) =>
    setChosen((current) => {
      const { [topic]: removed, ...rest } = current;
      return removed === undefined
        ? { ...current, [topic]: Math.min(DEFAULT_COUNT, available[topic] ?? DEFAULT_COUNT) }
        : rest;
    });

  const readFile = async (picked: File | undefined) => {
    if (!picked) return;
    const { questions, problems } = inspectQuestionText(await picked.text());
    const max = CUSTOM_TEST_LIMITS.questions.max;
    // A long file is cut to the maximum at random, so no part of it is favoured.
    setFile({
      questions: questions.length > max ? sampleQuestions(questions, max) : questions,
      validInFile: questions.length,
      problems: describeProblems(problems),
    });
  };

  const goLive = async () => {
    const end = windowEnd(schedule);
    if (hasErrors(errors) || end === null) return;
    setBusy(true);
    try {
      const created = await createCustomTest({
        data: {
          title: title.trim(),
          description,
          examType,
          sourceMode: mode,
          durationMinutes: schedule.durationMinutes,
          startsAt: new Date(schedule.startsAt).toISOString(),
          expiresAt: end.toISOString(),
          allocations:
            mode === "existing"
              ? allocations.map(({ topic, count: n }) => ({ topic, count: n }))
              : [],
          questions: mode === "upload" ? (file?.questions ?? []) : [],
        },
      });
      toast.success("The test is live.");
      setTitle("");
      setDescription("");
      setChosen({});
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setSchedule(defaultSchedule(new Date()));
      onCreated(created.id, created.token);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the test.");
    }
    setBusy(false);
  };

  const topicEntries = Object.entries(available).sort(([a], [b]) => a.localeCompare(b));

  return (
    <Section
      title="New live test"
      description="Choose the questions, set when the test opens and closes, and share the private link with candidates."
    >
      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void goLive();
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Test title" required>
            {(control) => (
              <Input
                {...control}
                maxLength={200}
                placeholder="e.g. Maternal health review"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            )}
          </Field>
          <ExamTypeField label="Major category" value={examType} onChange={changeExam} />
        </div>
        <Field label="Description" hint="Optional. Candidates see it before they start.">
          {(control) => (
            <Textarea
              {...control}
              rows={2}
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          )}
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium leading-none">Where the questions come from</span>
          <SegmentedChoice
            label="Question source"
            value={mode}
            onChange={setMode}
            options={[
              { value: "existing", label: "Question bank" },
              { value: "upload", label: "Upload TXT" },
            ]}
          />
        </div>

        {mode === "existing" ? (
          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium">
              Subcategories and how many questions from each
            </legend>
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {Object.keys(chosen).length} chosen · {count} questions in total (at most{" "}
              {CUSTOM_TEST_LIMITS.questions.max}). They are picked at random when you go live.
            </p>
            {topics.loading && !topics.data ? (
              <Skeleton className="h-32 w-full" />
            ) : topics.error ? (
              <p role="alert" className="text-sm text-destructive">
                The subcategories could not be loaded. {topics.error}
              </p>
            ) : topicEntries.length === 0 ? (
              <p className="rounded-md border p-4 text-sm text-muted-foreground">
                No subcategories found for {examType}.
              </p>
            ) : (
              <ul className="max-h-96 divide-y divide-divider overflow-y-auto rounded-md border">
                {topicEntries.map(([topic, inUse]) => {
                  const picked = chosen[topic];
                  const problem = errors.counts?.[topic];
                  return (
                    <li
                      key={topic}
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5"
                    >
                      <label className="flex min-w-0 flex-1 basis-56 cursor-pointer items-center gap-3 text-sm pointer-coarse:min-h-11">
                        <Checkbox
                          checked={picked !== undefined}
                          onCheckedChange={() => toggle(topic)}
                        />
                        <span className="min-w-0 flex-1">{topic}</span>
                        <span className="tabular-nums text-muted-foreground">{inUse} in use</span>
                      </label>
                      {picked !== undefined && (
                        <div className="flex flex-col gap-1">
                          <Input
                            aria-label={`Questions from ${topic}`}
                            aria-invalid={problem ? true : undefined}
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={inUse}
                            className="w-24"
                            value={Number.isNaN(picked) ? "" : picked}
                            onChange={(event) =>
                              setChosen((current) => ({
                                ...current,
                                [topic]: event.target.valueAsNumber,
                              }))
                            }
                          />
                          {problem && (
                            <p role="alert" className="text-xs font-medium text-destructive">
                              {problem}
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </fieldset>
        ) : (
          <div className="flex flex-col gap-3">
            <Field
              label="Question file (.txt)"
              required
              hint="One block per question: Q:, options A) to D), Answer:, and an optional Explanation:. Uploaded questions stay in this test; they join the bank only when you import them."
            >
              {(control) => (
                <Input
                  {...control}
                  ref={fileInput}
                  type="file"
                  accept=".txt,text/plain"
                  onChange={(event) => void readFile(event.target.files?.[0])}
                />
              )}
            </Field>
            {file && (
              <div aria-live="polite" className="flex flex-col gap-2">
                <p className="text-sm">
                  {file.validInFile} valid {file.validInFile === 1 ? "question" : "questions"} found
                  {file.validInFile > CUSTOM_TEST_LIMITS.questions.max
                    ? `; ${CUSTOM_TEST_LIMITS.questions.max} were chosen at random because a test holds at most ${CUSTOM_TEST_LIMITS.questions.max}.`
                    : "."}
                </p>
                {file.problems && (
                  <Alert variant="warning">
                    <AlertDescription>{file.problems}</AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </div>
        )}

        <ScheduleFields value={schedule} onChange={setSchedule} errors={errors} />

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={busy} disabled={hasErrors(errors)}>
              <Radio /> Go live · {Number.isNaN(count) ? 0 : count} questions
            </Button>
          </div>
          {todo.length > 0 && (
            <div aria-live="polite" className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Before you can go live:</p>
              <ul className="list-disc pl-5">
                {todo.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </form>
    </Section>
  );
}
