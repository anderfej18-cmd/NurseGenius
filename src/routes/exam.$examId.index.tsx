import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Flag, LayoutGrid, Send } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfidencePicker, type ConfidenceLevel } from "@/components/exam/ConfidencePicker";
import { ExamHeader } from "@/components/exam/ExamHeader";
import { OptionList } from "@/components/exam/OptionList";
import { QuestionNavigator } from "@/components/exam/QuestionNavigator";
import { SubmitDialog } from "@/components/exam/SubmitDialog";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { getExamSession, saveExamAnswer, submitExamSession } from "@/functions/sessions.functions";
import { useAuth } from "@/hooks/use-auth";
import {
  countItems,
  isTypingTarget,
  milestoneCrossed,
  milestoneText,
  optionForKey,
  remainingSeconds,
  submitUnlocked,
  type OptionLetter,
} from "@/lib/exam-runtime";

export const Route = createFileRoute("/exam/$examId/")({
  component: ExamRuntime,
  head: () => ({
    meta: [
      { title: "Practice test | NurseGenius" },
      {
        name: "description",
        content: "Complete your timed nursing exam practice and review your answers.",
      },
      { property: "og:title", content: "Practice test | NurseGenius" },
      { property: "og:description", content: "Complete your timed nursing exam practice." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

interface Question {
  id: string;
  question_text: string | null;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  topic: string;
}
interface AnswerRow {
  id: string;
  question_id: string;
  user_answer: string | null;
  flagged: boolean;
  confidence: ConfidenceLevel | null;
  position: number;
}
interface ExamRow {
  id: string;
  total_questions: number;
  time_limit_minutes: number;
  started_at: string;
  deadline_at: string;
}
interface Item {
  a: AnswerRow;
  q: Question;
}

type SaveInput = Parameters<typeof saveExamAnswer>[0]["data"];
type SaveStatus =
  | { phase: "saved" }
  | { phase: "saving" }
  | { phase: "failed"; input: SaveInput; message: string };

function ExamRuntime() {
  const { examId } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // A signed-out visitor has no test to show; send them to sign in rather than leave a blank page.
  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const [exam, setExam] = useState<ExamRow | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [now, setNow] = useState(Date.now());
  // Server time minus browser time, so the countdown follows the server's deadline.
  const clockOffset = useRef(0);
  // Time spent per question, reported to the server with each save (advisory data only).
  const spentMs = useRef<Record<string, number>>({});
  const shownAt = useRef(Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ phase: "saved" });
  const [announcement, setAnnouncement] = useState("");
  const pendingSaves = useRef(0);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const view = await getExamSession({ data: { examId } });
        if (view.session.status !== "in_progress") {
          navigate({ to: "/exam/$examId/results", params: { examId } });
          return;
        }
        clockOffset.current = new Date(view.session.serverNow).getTime() - Date.now();
        setExam({
          id: view.session.id,
          total_questions: view.session.totalQuestions,
          time_limit_minutes: view.session.timeLimitMinutes,
          started_at: view.session.startedAt,
          deadline_at: view.session.deadlineAt,
        });
        setItems(
          view.items.map((it) => ({
            a: {
              id: it.answerId,
              question_id: it.questionId,
              user_answer: it.userAnswer,
              flagged: it.flagged,
              confidence: it.confidence,
              position: it.position,
            },
            q: it.question,
          })),
        );
        shownAt.current = Date.now();
        setLoaded(true);
      } catch (error) {
        setLoadError((error as Error).message || "This test could not be loaded.");
      }
    })();
  }, [examId, user, navigate]);

  const remaining = exam ? remainingSeconds(exam.deadline_at, now) : 0;
  const lastRemaining = useRef(remaining);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + clockOffset.current), 1000);
    return () => clearInterval(timer);
  }, []);

  // Say so, politely, when ten, five and one minute are left.
  useEffect(() => {
    if (!loaded) return;
    const crossed = milestoneCrossed(lastRemaining.current, remaining);
    if (crossed !== null) setAnnouncement(milestoneText(crossed));
    lastRemaining.current = remaining;
  }, [remaining, loaded]);

  const counts = useMemo(
    () =>
      countItems(
        items.map((item) => ({ answered: item.a.user_answer !== null, flagged: item.a.flagged })),
      ),
    [items],
  );
  const canSubmit = exam
    ? submitUnlocked({
        answered: counts.answered,
        total: items.length,
        startedAt: exam.started_at,
        limitMinutes: exam.time_limit_minutes,
        nowMs: now,
      })
    : false;

  const current = items[idx];

  // Cumulative milliseconds spent on the question that is currently on screen.
  const timeOnCurrent = useCallback(() => {
    if (!current) return 0;
    const id = current.a.question_id;
    return (spentMs.current[id] ?? 0) + (Date.now() - shownAt.current);
  }, [current]);

  const goTo = useCallback(
    (next: number) => {
      if (next < 0 || next >= items.length || next === idx) return;
      if (current) spentMs.current[current.a.question_id] = timeOnCurrent();
      shownAt.current = Date.now();
      setIdx(next);
      // Each question starts at its top, with no scrolling animation.
      window.scrollTo({ top: 0, behavior: "instant" });
    },
    [current, idx, items.length, timeOnCurrent],
  );

  /** Saves one change and tracks the outcome, so a failure is shown and can be retried, never lost silently. */
  const persist = useCallback(async (input: SaveInput) => {
    pendingSaves.current += 1;
    setSaveStatus({ phase: "saving" });
    try {
      await saveExamAnswer({ data: input });
      pendingSaves.current -= 1;
      setSaveStatus((previous) =>
        pendingSaves.current === 0 && previous.phase !== "failed" ? { phase: "saved" } : previous,
      );
    } catch (error) {
      pendingSaves.current -= 1;
      setSaveStatus({
        phase: "failed",
        input,
        message: (error as Error).message || "Check your connection.",
      });
    }
  }, []);

  const patchCurrent = (patch: Partial<AnswerRow>) =>
    setItems((previous) =>
      previous.map((item, i) => (i === idx ? { ...item, a: { ...item.a, ...patch } } : item)),
    );

  const setAnswer = useCallback(
    (letter: OptionLetter) => {
      if (!current) return;
      setItems((previous) =>
        previous.map((item, i) =>
          i === idx ? { ...item, a: { ...item.a, user_answer: letter } } : item,
        ),
      );
      void persist({
        examId,
        questionId: current.a.question_id,
        answer: letter,
        timeSpentMs: timeOnCurrent(),
      });
    },
    [current, examId, idx, persist, timeOnCurrent],
  );

  const toggleFlag = useCallback(() => {
    if (!current) return;
    const flagged = !current.a.flagged;
    setItems((previous) =>
      previous.map((item, i) => (i === idx ? { ...item, a: { ...item.a, flagged } } : item)),
    );
    void persist({ examId, questionId: current.a.question_id, flagged });
  }, [current, examId, idx, persist]);

  const setConfidence = (level: ConfidenceLevel) => {
    if (!current) return;
    patchCurrent({ confidence: level });
    void persist({ examId, questionId: current.a.question_id, confidence: level });
  };

  const submit = useCallback(async () => {
    if (!exam || submitting) return;
    setSubmitting(true);
    try {
      // The server scores the exam from the answer key; nothing about the result is sent from here.
      await submitExamSession({ data: { examId: exam.id } });
      navigate({ to: "/exam/$examId/results", params: { examId: exam.id } });
    } catch (error) {
      toast.error((error as Error).message ?? "Submit failed. Please try again.");
      setSubmitting(false);
    }
  }, [exam, navigate, submitting]);

  // When the time is up the test is handed in by itself.
  useEffect(() => {
    if (exam && loaded && remaining === 0 && !submitting) void submit();
  }, [exam, loaded, remaining, submitting, submit]);

  // Keyboard: A to D choose, the arrow keys move between questions, F flags. Nothing animates.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      if (confirming || navigatorOpen || submitting) return;
      const letter = optionForKey(event.key);
      if (letter) {
        event.preventDefault();
        setAnswer(letter);
      } else if (event.key === "ArrowRight") goTo(idx + 1);
      else if (event.key === "ArrowLeft") goTo(idx - 1);
      else if (event.key.toLowerCase() === "f") toggleFlag();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirming, navigatorOpen, submitting, setAnswer, goTo, idx, toggleFlag]);

  if (loadError)
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md items-center gutter">
        <EmptyState
          className="w-full"
          title="This test could not be loaded"
          description={loadError}
          action={
            <Button onClick={() => navigate({ to: "/dashboard" })}>Back to the dashboard</Button>
          }
        />
      </div>
    );

  if (!exam || !loaded)
    return (
      <div
        className="mx-auto flex min-h-dvh w-full max-w-[1100px] flex-col gap-4 gutter pt-20"
        aria-busy="true"
      >
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );

  if (items.length === 0)
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md items-center gutter">
        <EmptyState
          className="w-full"
          title="This test has no complete questions to show"
          description="Nothing was lost: no answers were recorded."
          action={
            <Button onClick={() => navigate({ to: "/dashboard" })}>Back to the dashboard</Button>
          }
        />
      </div>
    );

  const last = idx === items.length - 1;

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <ExamHeader
        position={idx + 1}
        total={items.length}
        answered={counts.answered}
        remaining={remaining}
        canSubmit={canSubmit}
        announcement={announcement}
        onSubmit={() => setConfirming(true)}
      />

      <main id="main" className="flex-1 gutter pb-32 pt-4 lg:pt-6">
        <div className="mx-auto grid grid-cols-1 w-full max-w-[1100px] gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <h1 className="sr-only">
            Practice test, question {idx + 1} of {items.length}
          </h1>
          <section aria-labelledby="question-heading" className="flex min-w-0 flex-col gap-5">
            <Card className="flex flex-col gap-6 p-5 sm:p-7">
              <div className="flex items-start justify-between gap-3">
                <Badge variant="outline" className="h-auto max-w-[60%] whitespace-normal text-left">
                  {current.q.topic}
                </Badge>
                <Button
                  variant={current.a.flagged ? "secondary" : "ghost"}
                  size="sm"
                  aria-pressed={current.a.flagged}
                  onClick={toggleFlag}
                >
                  <Flag fill={current.a.flagged ? "currentColor" : "none"} />
                  {current.a.flagged ? "Flagged" : "Flag for review"}
                </Button>
              </div>
              <h2
                id="question-heading"
                className="font-sans text-lg font-medium leading-relaxed tracking-normal md:text-xl"
              >
                <span className="sr-only">Question {idx + 1}. </span>
                {current.q.question_text}
              </h2>
              <OptionList
                options={{
                  A: current.q.option_a,
                  B: current.q.option_b,
                  C: current.q.option_c,
                  D: current.q.option_d,
                }}
                selected={current.a.user_answer}
                onSelect={setAnswer}
              />
              <ConfidencePicker value={current.a.confidence} onChange={setConfidence} />
            </Card>

            {saveStatus.phase === "failed" && (
              <Alert variant="destructive">
                <p>Your last change could not be saved. {saveStatus.message}</p>
                <div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void persist(saveStatus.input)}
                  >
                    Try saving again
                  </Button>
                </div>
              </Alert>
            )}
            <p role="status" className="text-xs text-muted-foreground">
              {saveStatus.phase === "saving"
                ? "Saving…"
                : saveStatus.phase === "saved"
                  ? "All changes saved."
                  : ""}
              <span className="hidden lg:inline">
                {" "}
                Keys: A to D choose, left and right arrows move, F flags.
              </span>
            </p>
          </section>

          <aside className="hidden lg:block" aria-label="Question navigator">
            <Card className="sticky top-24 p-4">
              <h2 className="mb-3 font-sans text-sm font-semibold tracking-normal">Questions</h2>
              <QuestionNavigator
                items={items.map((item) => ({
                  answered: item.a.user_answer !== null,
                  flagged: item.a.flagged,
                }))}
                current={idx}
                onSelect={goTo}
              />
            </Card>
          </aside>
        </div>
      </main>

      <nav
        aria-label="Move between questions"
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t bg-background"
      >
        <div className="mx-auto flex h-16 w-full max-w-[1100px] items-center justify-between gap-3 gutter">
          <Button
            variant="outline"
            size="lg"
            className="max-sm:px-3"
            disabled={idx === 0}
            onClick={() => goTo(idx - 1)}
          >
            <ChevronLeft />
            Previous
          </Button>
          <Button
            variant="ghost"
            size="lg"
            className="lg:hidden max-sm:px-3"
            aria-label="Questions"
            onClick={() => setNavigatorOpen(true)}
          >
            <LayoutGrid />
            <span className="max-sm:hidden">Questions</span>
          </Button>
          {last ? (
            <Button
              size="lg"
              className="max-sm:px-3"
              disabled={!canSubmit}
              onClick={() => setConfirming(true)}
            >
              <Send />
              Review and submit
            </Button>
          ) : (
            <Button size="lg" className="max-sm:px-3" onClick={() => goTo(idx + 1)}>
              Next
              <ChevronRight />
            </Button>
          )}
        </div>
      </nav>

      <Sheet open={navigatorOpen} onOpenChange={setNavigatorOpen}>
        <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto rounded-t-xl">
          <SheetHeader>
            <SheetTitle>Questions</SheetTitle>
            <SheetDescription>Choose a question to go to it.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 pb-4">
            <QuestionNavigator
              items={items.map((item) => ({
                answered: item.a.user_answer !== null,
                flagged: item.a.flagged,
              }))}
              current={idx}
              onSelect={(index) => {
                goTo(index);
                setNavigatorOpen(false);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      <SubmitDialog
        open={confirming}
        onOpenChange={setConfirming}
        counts={counts}
        submitting={submitting}
        onSubmit={() => void submit()}
      />
    </div>
  );
}
