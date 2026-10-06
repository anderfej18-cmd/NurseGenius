import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth, TIER_DAILY_LIMIT, TIER_SESSION_LIMIT } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { fetchTopics } from "@/lib/topics";
import { isCompleteQuestion } from "@/lib/questions";

export const Route = createFileRoute("/exam/start")({ component: ExamStart, head: () => ({ meta: [
  { title: "Start a Practice Exam — NurseGenius" }, { name: "description", content: "Choose an RN or RM nursing practice exam, study area, question count, and time limit." },
  { property: "og:title", content: "Start a Practice Exam — NurseGenius" }, { property: "og:description", content: "Set up a timed RN or RM nursing practice exam." },
  { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
] }) });

const ALL_AREAS = "All Areas";

function ExamStart() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [examType, setExamType] = useState<"RN" | "RM">("RN");
  const [category, setCategory] = useState(ALL_AREAS);
  const [topics, setTopics] = useState<string[]>([]);
  const [count, setCount] = useState(50);
  const [minutes, setMinutes] = useState(60);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (profile) {
      setCount(Math.min(50, TIER_SESSION_LIMIT[profile.tier]));
      if (profile.exam_preference && profile.exam_preference !== "Both")
        setExamType(profile.exam_preference);
    }
  }, [profile]);

  useEffect(() => {
    (async () => {
      setTopics(await fetchTopics(examType));
    })();
  }, [examType]);

  const start = async () => {
    if (!user || !profile) return;
    const today = new Date().toISOString().slice(0, 10);
    const used = profile.last_question_date === today ? profile.questions_today : 0;
    const sessionCap = TIER_SESSION_LIMIT[profile.tier];
    const dailyCap = TIER_DAILY_LIMIT[profile.tier]; // null = unlimited
    if (count > sessionCap) return toast.error(`${profile.tier} tier allows max ${sessionCap} questions per quiz.`);
    if (dailyCap !== null) {
      const remaining = dailyCap - used;
      if (remaining <= 0) return toast.error("You've hit your daily limit. Upgrade your tier or come back tomorrow.");
      if (count > remaining) return toast.error(`Only ${remaining} questions left today on your tier.`);
    }

    setBusy(true);
    // Page through the bank so "All Areas" draws from every subcategory,
    // not just the first 1000 rows the API returns per request.
    const PAGE = 1000;
    const pool: Array<{
      id: string;
      question_text: string | null;
      option_a: string | null;
      option_b: string | null;
      option_c: string | null;
      option_d: string | null;
      correct_answer: string | null;
    }> = [];
    let e1: unknown = null;
    for (let from = 0; ; from += PAGE) {
      let q = supabase.from("questions")
        .select("id, question_text, option_a, option_b, option_c, option_d, correct_answer")
        .eq("exam_type", examType);
      if (category !== ALL_AREAS) q = q.eq("topic", category);
      const { data, error } = await q.range(from, from + PAGE - 1);
      if (error) { e1 = error; break; }
      pool.push(...((data ?? []).filter(isCompleteQuestion) as typeof pool));
      if (!data || data.length < PAGE) break;
    }
    if (e1 || pool.length === 0) {
      setBusy(false);
      return toast.error("No questions available for this selection. Ask an admin to upload some.");
    }
    if (pool.length < count) {
      toast.info(`Only ${pool.length} complete questions are available for this selection.`);
    }
    const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, count);

    const { data: exam, error: e2 } = await supabase.from("exams").insert({
      user_id: user.id, exam_type: examType, category,
      total_questions: shuffled.length, time_limit_minutes: minutes,
    }).select().single();
    if (e2 || !exam) { setBusy(false); return toast.error(e2?.message ?? "Failed to start"); }

    const rows = shuffled.map((q, i) => ({ exam_id: exam.id, question_id: q.id, position: i }));
    const { error: e3 } = await supabase.from("exam_answers").insert(rows);
    if (e3) { setBusy(false); return toast.error(e3.message); }

    // Update daily counter
    await supabase.from("profiles").update({
      questions_today: used + shuffled.length,
      last_question_date: today,
    }).eq("id", user.id);

    navigate({ to: "/exam/$examId", params: { examId: exam.id } });
  };

  if (!profile) return <><AppHeader /><div className="p-12 text-center">Loading…</div></>;

  return (
    <>
      <AppHeader />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <h1 className="text-3xl font-bold mb-6">Configure Your Test</h1>
        <Card className="p-6 bg-card-soft space-y-6">
          <div>
            <Label>Exam Type</Label>
            <Select value={examType} onValueChange={(v) => setExamType(v as "RN" | "RM")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="RN">RN — Registered Nurse</SelectItem>
                <SelectItem value="RM">RM — Registered Midwife</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Topic / Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_AREAS}>All Areas</SelectItem>
                {topics.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Number of Questions: {count}</Label>
            <Slider value={[count]} min={10} max={TIER_SESSION_LIMIT[profile.tier]} step={10}
              onValueChange={(v) => setCount(v[0])} className="mt-2" />
          </div>
          <div>
            <Label>Time Limit: {minutes} minutes</Label>
            <Slider value={[minutes]} min={15} max={180} step={5}
              onValueChange={(v) => setMinutes(v[0])} className="mt-2" />
          </div>
          <Button onClick={start} disabled={busy} className="w-full bg-hero shadow-glow" size="lg">
            {busy ? "Starting…" : "Begin Test"}
          </Button>
        </Card>
      </main>
    </>
  );
}
