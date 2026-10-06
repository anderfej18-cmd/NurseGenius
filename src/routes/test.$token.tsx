import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { claimSharedTestAttempt, getSharedTest, startSharedTest, submitSharedTest } from "@/lib/custom-tests.functions";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/test/$token")({
  component: SharedTestPage,
  head: () => ({
    meta: [
      { title: "Shared Nursing Practice Test — NurseGenius" },
      { name: "description", content: "Complete a timed shared nursing practice test on NurseGenius." },
      { property: "og:title", content: "Shared Nursing Practice Test — NurseGenius" },
      { property: "og:description", content: "Complete a timed shared nursing practice test on NurseGenius." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

interface Question {
  id: string;
  position: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
}
interface SharedTestData {
  expired: boolean;
  test: { id: string; title: string; description: string | null; exam_type: "RN" | "RM"; duration_minutes: number; expires_at: string } | null;
  questions: Question[];
}
interface TestResultItem {
  question_id: string;
  question_position: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  rationale: string | null;
  user_answer: string | null;
  is_correct: boolean;
}
interface TestResult { score: number; correct: number; total: number; results: TestResultItem[] }
const SHARED_ATTEMPT_KEY = "ng.sharedTestAttempt";

function SharedTestPage() {
  const { token } = Route.useParams();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const loadTest = useServerFn(getSharedTest);
  const beginTest = useServerFn(startSharedTest);
  const finishTest = useServerFn(submitSharedTest);
  const claimAttempt = useServerFn(claimSharedTestAttempt);
  const [testData, setTestData] = useState<SharedTestData | null>(null);
  const [email, setEmail] = useState("");
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [accessKey, setAccessKey] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [position, setPosition] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [result, setResult] = useState<TestResult | null>(null);
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null);
  const [aiAnswers, setAiAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEmail(user?.email ?? "");
  }, [user?.email]);

  useEffect(() => {
    let active = true;
    const tokenHashPromise = crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    void tokenHashPromise.then(async (digest) => {
      const tokenHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      try {
        const resultData = await loadTest({ data: { tokenHash } });
        if (active) setTestData(resultData);
      } catch (error) {
        if (active) {
          setTestData({ expired: true, test: null, questions: [] });
          toast.error(error instanceof Error ? error.message : "Could not load this test.");
        }
      }
    });
    return () => { active = false; };
  }, [token, loadTest]);

  const questions = testData?.questions ?? [];
  const question = questions[position];
  const needed = Math.ceil(questions.length * 0.8);
  const answeredCount = Object.values(answers).filter(Boolean).length;
  const options = useMemo(() => question ? [
    ["A", question.option_a], ["B", question.option_b], ["C", question.option_c], ["D", question.option_d],
  ] as const : [], [question]);

  useEffect(() => {
    if (!startedAt || !duration || result) return;
    const end = new Date(startedAt).getTime() + duration * 60_000;
    const tick = () => setRemaining(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt, duration, result]);

  const submit = async (force = false) => {
    if (!attemptId || !accessKey || busy || result) return;
    if (!force && answeredCount < needed && remaining > 0) return toast.error(`Answer at least ${needed} questions before submitting.`);
    setBusy(true);
    try {
      const submitted = await finishTest({ data: {
        attemptId, accessKey,
        answers: questions.map((entry) => ({ question_id: entry.id, user_answer: answers[entry.id] ?? null })),
      } });
      setResult(submitted);
      if (user) {
        try { await claimAttempt({ data: { attemptId, accessKey } }); }
        catch { /* Results remain visible if this account cannot claim the attempt. */ }
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not submit the test."); }
    finally { setBusy(false); }
  };

  const askAi = async (item: TestResult["results"][number]) => {
    setAiLoadingId(item.question_id);
    try {
      const { data, error } = await supabase.functions.invoke("ask-ai", {
        body: {
          question: item.question_text,
          options: { A: item.option_a, B: item.option_b, C: item.option_c, D: item.option_d },
          correct: item.correct_answer,
          topic: testData?.test?.exam_type ?? "Nursing",
        },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      setAiAnswers((current) => ({ ...current, [item.question_id]: (data as { explanation?: string }).explanation ?? "No response." }));
    } catch (error) { toast.error(error instanceof Error ? error.message : "AI request failed."); }
    finally { setAiLoadingId(null); }
  };

  useEffect(() => {
    const deadlineReached = startedAt && duration > 0 && Date.now() >= new Date(startedAt).getTime() + duration * 60_000;
    if (attemptId && deadlineReached && !result) void submit(true);
    // Submit once when the countdown ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, attemptId, result, duration, startedAt]);

  const start = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!testData || testData.expired) return;
    setBusy(true);
    try {
      const tokenDigest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
      const tokenHash = Array.from(tokenDigest, (byte) => byte.toString(16).padStart(2, "0")).join("");
      const key = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const started = await beginTest({ data: { tokenHash, email, accessKey: key } });
      setAttemptId(started.attemptId); setAccessKey(key); setStartedAt(started.startedAt); setDuration(started.durationMinutes);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not start this test."); }
    finally { setBusy(false); }
  };

  if (!testData) return <><AppHeader /><main className="container mx-auto max-w-3xl px-4 py-12"><Card className="p-6 text-center text-muted-foreground">Loading test…</Card></main></>;
  if (testData.expired || !testData.test) return <><AppHeader /><main className="container mx-auto max-w-xl px-4 py-12"><Card className="p-8 text-center"><Clock3 className="mx-auto h-8 w-8 text-muted-foreground" /><h1 className="mt-4 text-2xl font-semibold">This test link has expired</h1><p className="mt-2 text-sm text-muted-foreground">Ask the test administrator for a new link.</p></Card></main></>;
  if (!questions.length) return <><AppHeader /><main className="container mx-auto max-w-xl px-4 py-12"><Card className="p-8 text-center"><h1 className="text-2xl font-semibold">No questions available</h1></Card></main></>;

  if (result) {
    return <><AppHeader /><main className="container mx-auto max-w-4xl space-y-6 px-4 py-8">
      <Card className="p-6"><p className="text-sm uppercase text-muted-foreground">{testData.test.title}</p><h1 className="mt-2 text-3xl font-bold">{result.score >= 50 ? "Test passed" : "Keep practising"}</h1><p className="mt-2 text-xl">{result.score}% <span className="text-base text-muted-foreground">· {result.correct} of {result.total} correct</span></p><Progress value={result.score} className="mt-4" /></Card>
      {user && !profile?.onboarded && <Card className="p-5"><h2 className="font-semibold">Complete your profile</h2><p className="mt-1 text-sm text-muted-foreground">Save this result to your NurseGenius account and unlock your study tools.</p><Button className="mt-3" onClick={() => { if (attemptId && accessKey) sessionStorage.setItem(SHARED_ATTEMPT_KEY, JSON.stringify({ attemptId, accessKey, email })); void navigate({ to: "/onboarding" }); }}>Complete Profile</Button></Card>}
      {!user && <Card className="p-5"><h2 className="font-semibold">Save your result and complete your profile</h2><p className="mt-1 text-sm text-muted-foreground">Create or sign in to an account using {email}; your completed test can then be linked to it.</p><Button className="mt-3" asChild><Link to="/auth" onClick={() => { if (attemptId && accessKey) sessionStorage.setItem(SHARED_ATTEMPT_KEY, JSON.stringify({ attemptId, accessKey, email })); }}>Complete Profile</Link></Button></Card>}
      <section className="space-y-3"><h2 className="text-xl font-semibold">Answer review</h2>{result.results.map((entry, index) => <Card key={entry.question_id} className="p-5"><div className="flex items-start gap-3"><span className="text-sm font-semibold text-muted-foreground">{index + 1}.</span><div className="min-w-0 flex-1"><p className="font-medium">{entry.question_text}</p><div className="mt-3 space-y-1 text-sm">{[["A", entry.option_a], ["B", entry.option_b], ["C", entry.option_c], ["D", entry.option_d]].map(([letter, text]) => <p key={letter} className={letter === entry.correct_answer ? "font-medium text-success" : letter === entry.user_answer ? "text-destructive" : "text-muted-foreground"}>{letter}. {text}{letter === entry.correct_answer ? " · Correct answer" : letter === entry.user_answer ? " · Your answer" : ""}</p>)}</div>{entry.rationale && <p className="mt-3 border-t pt-3 text-sm text-muted-foreground"><strong>Explanation:</strong> {entry.rationale}</p>}{user && profile?.onboarded && <Button className="mt-3" size="sm" variant="outline" disabled={aiLoadingId === entry.question_id} onClick={() => void askAi(entry)}><Sparkles className="h-4 w-4"/>{aiLoadingId === entry.question_id ? "Thinking…" : "Ask AI"}</Button>}{aiAnswers[entry.question_id] && <p className="mt-3 whitespace-pre-wrap border-t pt-3 text-sm">{aiAnswers[entry.question_id]}</p>}</div><CheckCircle2 className={`h-5 w-5 shrink-0 ${entry.is_correct ? "text-success" : "text-muted-foreground"}`} /></div></Card>)}</section>
    </main></>;
  }

  if (!attemptId) return <><AppHeader /><main className="container mx-auto max-w-2xl px-4 py-8"><Card className="p-6"><p className="text-sm uppercase text-muted-foreground">{testData.test.exam_type} · {questions.length} questions · {testData.test.duration_minutes} minutes</p><h1 className="mt-2 text-3xl font-bold">{testData.test.title}</h1>{testData.test.description && <p className="mt-3 text-muted-foreground">{testData.test.description}</p>}<Separator className="my-5"/><form className="space-y-3" onSubmit={(event) => void start(event)}><Label htmlFor="test-email">Email address</Label><Input id="test-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com"/><Button className="mt-2" disabled={busy}>{busy ? "Starting…" : "Start test"}</Button></form></Card></main></>;

  return <><AppHeader /><main className="container mx-auto max-w-4xl space-y-5 px-4 py-6">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-muted-foreground">{testData.test.exam_type} · {testData.test.title}</p><h1 className="text-2xl font-semibold">Question {position + 1} of {questions.length}</h1></div><div className="flex items-center gap-2 font-mono text-lg" aria-live="polite"><Clock3 className="h-4 w-4"/>{Math.floor(remaining / 60).toString().padStart(2, "0")}:{(remaining % 60).toString().padStart(2, "0")}</div></header>
    <div><Progress value={(answeredCount / questions.length) * 100}/><p className="mt-1 text-xs text-muted-foreground">{answeredCount} answered · {needed} required to submit before time runs out</p></div>
    {question && <Card className="p-5 sm:p-7"><div className="flex items-start gap-3"><span className="font-semibold text-muted-foreground">{position + 1}.</span><div className="min-w-0 flex-1"><p className="text-lg font-medium leading-relaxed">{question.question_text}</p><RadioGroup className="mt-5 space-y-3" value={answers[question.id] ?? ""} onValueChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}>{options.map(([letter, text]) => <Label key={letter} htmlFor={`answer-${letter}`} className="flex cursor-pointer items-start gap-3 border p-3 font-normal"><RadioGroupItem id={`answer-${letter}`} value={letter}/><span><strong>{letter}.</strong> {text}</span></Label>)}</RadioGroup></div></div></Card>}
    <div className="flex flex-wrap items-center justify-between gap-2"><Button variant="outline" disabled={position === 0} onClick={() => setPosition((value) => Math.max(0, value - 1))}><ArrowLeft className="h-4 w-4"/>Previous</Button><div className="flex gap-2">{position < questions.length - 1 && <Button onClick={() => setPosition((value) => Math.min(questions.length - 1, value + 1))}>Next<ArrowRight className="h-4 w-4"/></Button>}<Button variant="destructive" disabled={busy} onClick={() => void submit()}>{busy ? "Submitting…" : "Submit test"}</Button></div></div>
  </main></>;
}