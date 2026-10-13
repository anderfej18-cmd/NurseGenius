import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import {
  ProgrammeStep,
  SelectionStep,
  SizeStep,
  StepSection,
  TopicStep,
  type CountsState,
} from "@/components/exam/StartSteps";
import { StartSummary } from "@/components/exam/StartSummary";
import { Skeleton } from "@/components/ui/skeleton";
import { startExamSession } from "@/functions/sessions.functions";
import { useAuth } from "@/hooks/use-auth";
import { useServerData, type ServerData } from "@/hooks/use-server-data";
import { fetchTopicCounts } from "@/hooks/topic-data";
import { ALL_AREAS } from "@/lib/exam-rules";
import type { ExamType } from "@/lib/exam-type";
import { SELECTION_LABELS, type SelectionMode } from "@/lib/session-modes";
import { parseStartSearch } from "@/lib/start-search";
import {
  allowanceFor,
  allowanceNote,
  clampCount,
  defaultCount,
  sessionLimitFor,
  suggestedMinutes,
} from "@/lib/start-flow";

export const Route = createFileRoute("/_app/exam/start")({
  component: ExamStart,
  validateSearch: parseStartSearch,
  head: () => ({
    meta: [
      { title: "Take a test | NurseGenius" },
      {
        name: "description",
        content:
          "Choose an RN or RM nursing practice test: topic, how questions are chosen, how many, and how long.",
      },
      { property: "og:title", content: "Take a test | NurseGenius" },
      { property: "og:description", content: "Set up a timed RN or RM nursing practice test." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const toState = (data: ServerData<Record<string, number>>): CountsState =>
  data.data
    ? { status: "ready", counts: data.data }
    : data.error
      ? { status: "error", message: data.error, retry: () => void data.reload() }
      : { status: "loading" };

function ExamStart() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const preset = Route.useSearch();

  const [examType, setExamType] = useState<ExamType>(preset.examType ?? "RN");
  const [category, setCategory] = useState(preset.topic ?? ALL_AREAS);
  const [selection, setSelection] = useState<SelectionMode>(preset.selection ?? "random");
  const [count, setCount] = useState(50);
  const [minutes, setMinutes] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; code: string | null } | null>(null);
  const [topicNote, setTopicNote] = useState<string | null>(null);

  // Defaults come from the profile once, never again: a background profile refresh must not undo a choice.
  const initialised = useRef(false);
  const minutesChosen = useRef(false);
  useEffect(() => {
    if (!profile || initialised.current) return;
    initialised.current = true;
    const size = defaultCount(sessionLimitFor(profile.tier));
    setCount(size);
    setMinutes(suggestedMinutes(size));
    if (!preset.examType && profile.exam_preference && profile.exam_preference !== "Both")
      setExamType(profile.exam_preference);
  }, [profile, preset.examType]);

  const rn = useServerData(() => fetchTopicCounts("RN"), [], !!user);
  const rm = useServerData(() => fetchTopicCounts("RM"), [], !!user);
  const states = useMemo<Record<ExamType, CountsState>>(
    () => ({ RN: toState(rn), RM: toState(rm) }),
    [rn, rm],
  );
  const selected = states[examType];

  // A topic that is not in this programme (an old link, or after switching programme) falls back to all areas.
  useEffect(() => {
    if (selected.status !== "ready" || category === ALL_AREAS) return;
    if ((selected.counts[category] ?? 0) <= 0) {
      setTopicNote(`"${category}" has no questions in ${examType}, so all areas are selected.`);
      setCategory(ALL_AREAS);
    }
  }, [selected, category, examType]);

  const changeProgramme = (next: ExamType) => {
    if (next === examType) return;
    setExamType(next);
    setCategory(ALL_AREAS);
    setTopicNote(null);
  };
  const changeCount = (next: number) => {
    const sessionLimit = profile ? sessionLimitFor(profile.tier) : next;
    const clamped = clampCount(next, sessionLimit);
    setCount(clamped);
    if (!minutesChosen.current) setMinutes(suggestedMinutes(clamped));
  };
  const changeMinutes = (next: number) => {
    minutesChosen.current = true;
    setMinutes(next);
  };

  const similar = preset.similarTo !== undefined;
  const sessionLimit = profile ? sessionLimitFor(profile.tier) : 50;
  const allowance = profile
    ? allowanceFor(profile, new Date())
    : { limit: null, used: 0, remaining: null };
  const noQuestions =
    selected.status === "ready" && Object.values(selected.counts).every((total) => total <= 0);
  const disabledReason =
    !profile || selected.status === "loading"
      ? "Loading the question bank."
      : selected.status === "error"
        ? "The question bank could not be loaded. Try again above."
        : noQuestions
          ? `There are no ${examType} questions yet.`
          : null;

  const start = async () => {
    if (!user || !profile) return;
    setBusy(true);
    setError(null);
    try {
      // The server checks the plan and daily limits, picks the questions and creates the exam.
      const { examId, totalQuestions } = await startExamSession({
        data: {
          examType,
          category,
          count,
          minutes,
          selection: similar ? "similar" : selection,
          ...(preset.similarTo === undefined ? {} : { similarTo: preset.similarTo }),
        },
      });
      if (totalQuestions < count) {
        toast.info(`Only ${totalQuestions} complete questions are available for this selection.`);
      }
      navigate({ to: "/exam/$examId", params: { examId } });
    } catch (failure) {
      const problem = failure as Error & { code?: string };
      setError({
        message: problem.message || "The test could not be started.",
        code: problem.code ?? null,
      });
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Take a test"
        description="Choose what to practise, then begin. The questions are picked by the server from the NurseGenius bank."
      />
      {!profile ? (
        <div aria-busy="true" className="flex flex-col gap-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div className="flex flex-col gap-10">
            <StepSection
              number={1}
              title="Programme"
              description="Which exam are you preparing for?"
            >
              <ProgrammeStep value={examType} onChange={changeProgramme} states={states} />
            </StepSection>

            <StepSection number={2} title="Topic" description="One topic, or every area at once.">
              <div className="flex flex-col gap-3">
                {topicNote && (
                  <p role="status" className="text-sm text-muted-foreground">
                    {topicNote}
                  </p>
                )}
                <TopicStep state={selected} value={category} onChange={setCategory} />
              </div>
            </StepSection>

            <StepSection number={3} title="How questions are chosen">
              <SelectionStep value={selection} onChange={setSelection} similar={similar} />
            </StepSection>

            <StepSection
              number={4}
              title="Size and time"
              description="Your plan allows up to the limit shown."
            >
              <SizeStep
                count={count}
                minutes={minutes}
                sessionLimit={sessionLimit}
                onCount={changeCount}
                onMinutes={changeMinutes}
              />
            </StepSection>
          </div>

          <div className="lg:sticky lg:top-20">
            <StartSummary
              choice={{
                programme: examType === "RN" ? "RN, Registered Nurse" : "RM, Registered Midwife",
                topic: category === ALL_AREAS ? "All areas" : category,
                selection: similar
                  ? SELECTION_LABELS.similar.label
                  : SELECTION_LABELS[selection].label,
                count,
                minutes,
              }}
              allowance={allowance}
              allowanceNote={allowanceNote(allowance, count)}
              error={error?.message ?? null}
              errorCode={error?.code ?? null}
              busy={busy}
              disabledReason={disabledReason}
              onStart={() => void start()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
