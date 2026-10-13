import { Flag, ListChecks } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ExamHeader } from "@/components/exam/ExamHeader";
import { OptionList } from "@/components/exam/OptionList";
import { QuestionNavigator } from "@/components/exam/QuestionNavigator";
import { SubmitDialog } from "@/components/exam/SubmitDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { type getSharedAttempt, saveSharedAnswer } from "@/functions/custom-tests.functions";
import {
  type OptionLetter,
  answersNeededToSubmit,
  countItems,
  milestoneCrossed,
  milestoneText,
  sharedSubmitLockedText,
} from "@/lib/exam-runtime";
import { secondsUntil } from "@/lib/shared-test-clock";

type AttemptView = Awaited<ReturnType<typeof getSharedAttempt>>;

/**
 * A shared test being taken: one question per page, a numbered navigator, flags, and an answer saved on the
 * server as soon as it is chosen. The deadline and the clock are the server's; when time runs out the test
 * is handed in for the candidate, and the server scores what it saved.
 */
export function TestRunner({
  attemptId,
  accessKey,
  view,
  offset,
  submitting,
  onSubmit,
}: {
  attemptId: string;
  accessKey: string;
  view: AttemptView;
  offset: number;
  submitting: boolean;
  /** Hand the test in with every answer held on this screen. */
  onSubmit: (answers: Array<{ question_id: string; user_answer: string | null }>) => void;
}) {
  const questions = view.questions;
  const [position, setPosition] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, q.answer])),
  );
  const [flags, setFlags] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, q.flagged])),
  );
  const [remaining, setRemaining] = useState(() =>
    secondsUntil(view.deadlineAt, offset, Date.now()),
  );
  const [announcement, setAnnouncement] = useState("");
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [unsaved, setUnsaved] = useState(0);
  const handedIn = useRef(false);
  const lastRemaining = useRef(remaining);

  const items = questions.map((q) => ({
    answered: Boolean(answers[q.id]),
    flagged: Boolean(flags[q.id]),
  }));
  const counts = countItems(items);
  const question = questions[position];
  const canSubmit = counts.answered >= answersNeededToSubmit(questions.length) || remaining === 0;

  const handIn = () => {
    if (handedIn.current) return;
    handedIn.current = true;
    onSubmit(questions.map((q) => ({ question_id: q.id, user_answer: answers[q.id] ?? null })));
  };

  useEffect(() => {
    const tick = () => {
      const next = secondsUntil(view.deadlineAt, offset, Date.now());
      const milestone = milestoneCrossed(lastRemaining.current, next);
      if (milestone) setAnnouncement(milestoneText(milestone));
      lastRemaining.current = next;
      setRemaining(next);
    };
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [view.deadlineAt, offset]);

  useEffect(() => {
    if (remaining === 0) handIn();
    // handIn reads the latest answers on each render; it must run once, when the clock reaches zero.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  const save = async (questionId: string, answer: string | null, flagged: boolean) => {
    try {
      await saveSharedAnswer({ data: { attemptId, accessKey, questionId, answer, flagged } });
      setUnsaved((n) => Math.max(0, n - 1));
    } catch (error) {
      // Not fatal: the full set of answers is sent again on submit. Say so, once per failure streak.
      setUnsaved((n) => {
        if (n === 0)
          toast.error(
            "Could not save your last answer. Keep going; everything is sent when you submit.",
          );
        return n + 1;
      });
      void error;
    }
  };

  const choose = (letter: OptionLetter) => {
    if (!question) return;
    setAnswers((current) => ({ ...current, [question.id]: letter }));
    void save(question.id, letter, Boolean(flags[question.id]));
  };
  const toggleFlag = () => {
    if (!question) return;
    const next = !flags[question.id];
    setFlags((current) => ({ ...current, [question.id]: next }));
    void save(question.id, answers[question.id] ?? null, next);
  };

  const options = useMemo(
    () =>
      question
        ? { A: question.option_a, B: question.option_b, C: question.option_c, D: question.option_d }
        : null,
    [question],
  );
  if (!question || !options) return null;
  const flagged = Boolean(flags[question.id]);

  const navigator = (
    <QuestionNavigator
      items={items}
      current={position}
      onSelect={(index) => {
        setPosition(index);
        setNavigatorOpen(false);
      }}
    />
  );

  return (
    <div className="theme-fixed min-h-dvh bg-background text-foreground">
      <ExamHeader
        position={position + 1}
        total={questions.length}
        answered={counts.answered}
        remaining={remaining}
        canSubmit={canSubmit}
        announcement={announcement}
        lockedText={sharedSubmitLockedText(questions.length)}
        onSubmit={() => setConfirming(true)}
      />
      <div className="mx-auto grid w-full max-w-[1100px] gap-6 gutter py-6 pb-28 lg:grid-cols-[1fr_280px]">
        <main id="main" className="flex min-w-0 flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            {view.test.title} · {view.test.examType}
          </p>
          <Card className="flex flex-col gap-6 p-5 sm:p-7">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <h1 className="text-xl font-medium leading-relaxed md:text-2xl">
                {question.question_text}
              </h1>
              <Button
                variant="outline"
                size="sm"
                aria-pressed={flagged}
                onClick={toggleFlag}
                className="shrink-0 self-start"
              >
                <Flag fill={flagged ? "currentColor" : "none"} />
                {flagged ? "Flagged" : "Flag"}
              </Button>
            </div>
            <OptionList
              options={options}
              selected={answers[question.id] ?? null}
              onSelect={choose}
            />
          </Card>
          {unsaved > 0 && (
            <p role="status" className="text-sm text-warning">
              Some answers have not reached the server yet. They are sent when you submit.
            </p>
          )}
        </main>
        <aside aria-label="Questions" className="hidden lg:block">
          <div className="sticky top-24 rounded-lg border bg-card p-4">
            <h2 className="mb-3 font-sans text-sm font-semibold tracking-normal">Questions</h2>
            {navigator}
          </div>
        </aside>
      </div>

      <nav
        aria-label="Move between questions"
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t bg-background"
      >
        <div className="mx-auto flex h-16 w-full max-w-[1100px] items-center justify-between gap-3 gutter">
          <Button
            variant="outline"
            size="lg"
            className="max-sm:px-3"
            disabled={position === 0}
            onClick={() => setPosition((value) => Math.max(0, value - 1))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="max-sm:px-3 lg:hidden"
            aria-label="Questions"
            onClick={() => setNavigatorOpen(true)}
          >
            <ListChecks />
            <span className="max-sm:hidden">Questions</span>
          </Button>
          <Button
            size="lg"
            className="max-sm:px-3"
            disabled={position === questions.length - 1}
            onClick={() => setPosition((value) => Math.min(questions.length - 1, value + 1))}
          >
            Next
          </Button>
        </div>
      </nav>

      <Sheet open={navigatorOpen} onOpenChange={setNavigatorOpen}>
        <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto rounded-t-xl">
          <SheetHeader>
            <SheetTitle>Questions</SheetTitle>
            <SheetDescription>Choose a question to go to it.</SheetDescription>
          </SheetHeader>
          <div className="mt-4">{navigator}</div>
        </SheetContent>
      </Sheet>

      <SubmitDialog
        open={confirming}
        onOpenChange={setConfirming}
        counts={counts}
        submitting={submitting}
        onSubmit={handIn}
      />
    </div>
  );
}
