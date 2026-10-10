import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfidencePicker, type ConfidenceLevel } from "@/components/ConfidencePicker";
import { Flag, ChevronLeft, ChevronRight, Send, Timer } from "lucide-react";
import { toast } from "sonner";
import { getExamSession, saveExamAnswer, submitExamSession } from "@/functions/sessions.functions";

export const Route = createFileRoute("/exam/$examId/")({
  component: ExamRuntime,
  head: () => ({
    meta: [
      { title: "Timed Nursing Practice Exam — NurseGenius" },
      {
        name: "description",
        content: "Complete your timed nursing exam practice and review your answers.",
      },
      { property: "og:title", content: "Timed Nursing Practice Exam — NurseGenius" },
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
  status: string;
}

function ExamRuntime() {
  const { examId } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // A signed-out visitor has no test to show; send them to sign in rather than leave "Loading…".
  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const [exam, setExam] = useState<ExamRow | null>(null);
  const [items, setItems] = useState<{ a: AnswerRow; q: Question }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [idx, setIdx] = useState(0);
  const [now, setNow] = useState(Date.now());
  // Server time minus browser time, so the countdown follows the server's deadline.
  const clockOffset = useRef(0);
  // Time spent per question, reported to the server with each save (advisory data only).
  const spentMs = useRef<Record<string, number>>({});
  const shownAt = useRef(Date.now());
  const [submitting, setSubmitting] = useState(false);

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
          status: view.session.status,
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
        toast.error((error as Error).message || "Exam not found");
        navigate({ to: "/dashboard" });
      }
    })();
  }, [examId, user, navigate]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + clockOffset.current), 1000);
    return () => clearInterval(t);
  }, []);

  const elapsedSec = exam ? Math.floor((now - new Date(exam.started_at).getTime()) / 1000) : 0;
  const totalSec = exam ? exam.time_limit_minutes * 60 : 0;
  const remaining = exam
    ? Math.max(0, Math.floor((new Date(exam.deadline_at).getTime() - now) / 1000))
    : 0;
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  const answeredCount = useMemo(() => items.filter((i) => i.a.user_answer).length, [items]);
  const pctAnswered = items.length ? answeredCount / items.length : 0;
  const pctTime = totalSec ? elapsedSec / totalSec : 0;
  const canSubmit = pctAnswered >= 0.8 || pctTime >= 0.8;

  const current = items[idx];

  // Cumulative milliseconds spent on the question that is currently on screen.
  const timeOnCurrent = () => {
    if (!current) return 0;
    const id = current.a.question_id;
    return (spentMs.current[id] ?? 0) + (Date.now() - shownAt.current);
  };
  const goTo = (next: number) => {
    if (current) spentMs.current[current.a.question_id] = timeOnCurrent();
    shownAt.current = Date.now();
    setIdx(next);
  };

  const setAnswer = async (letter: "A" | "B" | "C" | "D") => {
    if (!current) return;
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, a: { ...it.a, user_answer: letter } } : it)),
    );
    try {
      await saveExamAnswer({
        data: {
          examId,
          questionId: current.a.question_id,
          answer: letter,
          timeSpentMs: timeOnCurrent(),
        },
      });
    } catch (error) {
      toast.error((error as Error).message);
    }
  };
  const setConfidence = async (level: ConfidenceLevel) => {
    if (!current) return;
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, a: { ...it.a, confidence: level } } : it)),
    );
    try {
      await saveExamAnswer({
        data: { examId, questionId: current.a.question_id, confidence: level },
      });
    } catch (error) {
      toast.error((error as Error).message);
    }
  };
  const toggleFlag = async () => {
    if (!current) return;
    const f = !current.a.flagged;
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, a: { ...it.a, flagged: f } } : it)),
    );
    try {
      await saveExamAnswer({ data: { examId, questionId: current.a.question_id, flagged: f } });
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const submit = useCallback(async () => {
    if (!exam || submitting) return;
    setSubmitting(true);
    try {
      // The server scores the exam from the answer key; nothing about the result is sent from here.
      await submitExamSession({ data: { examId: exam.id } });
      navigate({ to: "/exam/$examId/results", params: { examId: exam.id } });
    } catch (err) {
      toast.error((err as Error).message ?? "Submit failed. Please try again.");
      setSubmitting(false);
    }
  }, [exam, navigate, submitting]);

  useEffect(() => {
    if (exam && remaining === 0 && !submitting) submit();
  }, [exam, remaining, submitting, submit]);

  if (!exam || !loaded) return <div className="p-12 text-center">Loading exam…</div>;
  if (items.length === 0)
    return (
      <div className="p-12 text-center space-y-3">
        <p className="font-medium">This test has no complete questions to display.</p>
        <Button onClick={() => navigate({ to: "/dashboard" })}>Back to Dashboard</Button>
      </div>
    );

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">
              Question {idx + 1} of {items.length}
            </p>
            <p className="text-sm font-medium">{answeredCount} answered</p>
          </div>
          <div className="flex items-center gap-2 text-lg font-mono font-bold">
            <Timer className="h-4 w-4 text-primary" />
            <span className={remaining < 300 ? "text-destructive" : ""}>
              {mm}:{ss}
            </span>
          </div>
          <Button
            disabled={!canSubmit || submitting}
            onClick={submit}
            className="bg-hero"
            size="sm"
          >
            <Send className="h-4 w-4 mr-1" /> {submitting ? "Submitting…" : "Submit"}
          </Button>
        </div>
        {!canSubmit && (
          <p className="text-xs text-center text-muted-foreground pb-2">
            Submit unlocks at 80% answered ({Math.ceil(items.length * 0.8)} questions) or 80% time
            elapsed.
          </p>
        )}
      </header>

      <main className="flex-1 container mx-auto px-4 py-6 grid lg:grid-cols-[1fr_320px] gap-6">
        <Card className="p-6 bg-card-soft">
          <div className="flex justify-between items-start mb-4 gap-3">
            <Badge variant="outline">{current.q.topic}</Badge>
            <Button
              variant={current.a.flagged ? "destructive" : "outline"}
              size="sm"
              onClick={toggleFlag}
            >
              <Flag className="h-4 w-4 mr-1" /> {current.a.flagged ? "Flagged" : "Flag"}
            </Button>
          </div>
          <p className="text-base md:text-lg font-medium leading-relaxed">
            {current.q.question_text}
          </p>

          <div className="mt-6 space-y-2">
            {(["A", "B", "C", "D"] as const).map((letter) => {
              const text = current.q[`option_${letter.toLowerCase()}` as "option_a"];
              const selected = current.a.user_answer === letter;
              return (
                <button
                  key={letter}
                  onClick={() => setAnswer(letter)}
                  className={`w-full text-left p-4 rounded-lg border transition-all ${
                    selected
                      ? "border-primary bg-primary/10 shadow-soft"
                      : "border-border hover:border-primary/40 hover:bg-accent/40"
                  }`}
                >
                  <span className="font-bold mr-2">{letter}.</span>
                  {text}
                </button>
              );
            })}
          </div>

          <ConfidencePicker value={current.a.confidence} onChange={setConfidence} />

          <div className="mt-6 flex justify-between">
            <Button variant="outline" disabled={idx === 0} onClick={() => goTo(idx - 1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Previous
            </Button>
            <Button disabled={idx === items.length - 1} onClick={() => goTo(idx + 1)}>
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </Card>

        <Card className="p-4 lg:sticky lg:top-24 lg:self-start">
          <h3 className="font-semibold mb-3 text-sm">Question Navigator</h3>
          <div className="grid grid-cols-8 lg:grid-cols-6 gap-1.5">
            {items.map((it, i) => {
              const cls = i === idx ? "ring-2 ring-primary " : "";
              const color = it.a.flagged
                ? "bg-destructive text-destructive-foreground"
                : it.a.user_answer
                  ? "bg-success text-success-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent";
              return (
                <button
                  key={it.a.id}
                  onClick={() => goTo(i)}
                  className={`h-9 rounded text-xs font-medium ${color} ${cls}`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div className="mt-4 space-y-1 text-xs">
            <p>
              <span className="inline-block w-3 h-3 rounded bg-success mr-2 align-middle" />
              Answered
            </p>
            <p>
              <span className="inline-block w-3 h-3 rounded bg-destructive mr-2 align-middle" />
              Flagged
            </p>
            <p>
              <span className="inline-block w-3 h-3 rounded bg-muted mr-2 align-middle" />
              Unanswered
            </p>
          </div>
        </Card>
      </main>
    </div>
  );
}
