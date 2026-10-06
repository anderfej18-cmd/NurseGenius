import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth, TIER_LABEL, TIER_DAILY_LIMIT } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Trophy, Star, AlertCircle, Calendar } from "lucide-react";

export const Route = createFileRoute("/dashboard")({ component: Dashboard, head: () => ({ meta: [
  { title: "Study Dashboard — NurseGenius" }, { name: "description", content: "Review your nursing practice progress, daily question use, and recent test results." },
  { property: "og:title", content: "Study Dashboard — NurseGenius" }, { property: "og:description", content: "Your nursing practice progress, daily question use, and recent test results." },
  { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
] }) });

interface ExamRow {
  id: string;
  score_pct: number | null;
  exam_type: string;
  category: string;
  total_questions: number;
  completed_at: string | null;
}

function Dashboard() {
  const { user, profile, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [topicStats, setTopicStats] = useState<{ topic: string; correct: number; total: number }[]>([]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
    else if (!loading && user && profile && !profile.onboarded) navigate({ to: "/onboarding" });
  }, [loading, user, profile, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("exams")
        .select("id, score_pct, exam_type, category, total_questions, completed_at")
        .eq("user_id", user.id).eq("status", "completed")
        .order("completed_at", { ascending: false }).limit(10);
      setExams((data as ExamRow[]) ?? []);

      // Topic analysis from last 30 days
      const { data: agg } = await supabase
        .from("exam_answers")
        .select("is_correct, question_id, questions(topic), exams!inner(user_id, completed_at)")
        .eq("exams.user_id", user.id)
        .not("user_answer", "is", null);
      const byTopic: Record<string, { c: number; t: number }> = {};
      (agg as unknown as Array<{ is_correct: boolean; questions: { topic: string } | null }> ?? []).forEach((r) => {
        const topic = r.questions?.topic ?? "General";
        byTopic[topic] = byTopic[topic] || { c: 0, t: 0 };
        byTopic[topic].t++;
        if (r.is_correct) byTopic[topic].c++;
      });
      setTopicStats(Object.entries(byTopic).map(([topic, v]) => ({ topic, correct: v.c, total: v.t })));
    })();
  }, [user]);

  // Keep the daily question counter live: realtime profile updates + focus/interval refresh
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`profile-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
        () => { refresh(); },
      )
      .subscribe();

    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const interval = window.setInterval(() => { refresh(); }, 30000);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (loading || !profile) return <><AppHeader /><div className="p-12 text-center text-muted-foreground">Loading…</div></>;

  const dailyLimit = TIER_DAILY_LIMIT[profile.tier];
  const today = new Date().toISOString().slice(0, 10);
  const usedToday = profile.last_question_date === today ? profile.questions_today : 0;
  const avgScore = exams.length ? exams.reduce((s, e) => s + (e.score_pct ?? 0), 0) / exams.length : 0;

  const tagFor = (s: number) => {
    if (s >= 80) return { icon: <Trophy className="h-4 w-4" />, label: "Trophy", cls: "bg-warning text-warning-foreground" };
    if (s >= 70) return { icon: <Star className="h-4 w-4" />, label: "Solid", cls: "bg-success text-success-foreground" };
    if (s >= 50) return { icon: null, label: "Progress", cls: "bg-warning/60 text-warning-foreground" };
    return { icon: <AlertCircle className="h-4 w-4" />, label: "Promising — wake up strike!", cls: "bg-destructive text-destructive-foreground" };
  };

  const strengths = [...topicStats].filter(t => t.total >= 3).sort((a, b) => (b.correct/b.total) - (a.correct/a.total)).slice(0, 3);
  const weaknesses = [...topicStats].filter(t => t.total >= 3).sort((a, b) => (a.correct/a.total) - (b.correct/b.total)).slice(0, 3);

  return (
    <>
      <AppHeader />
      <main className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Welcome back,</p>
            <h1 className="text-3xl font-bold">{profile.username || profile.first_name} 👋</h1>
          </div>
          <Button asChild size="lg" className="bg-hero shadow-glow"><Link to="/exam/start">Take a Test</Link></Button>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Card className="p-5 bg-card-soft">
            <p className="text-xs uppercase text-muted-foreground">Tier</p>
            <p className="text-2xl font-bold mt-1">{TIER_LABEL[profile.tier]}</p>
            {profile.expiry_date && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Expires {new Date(profile.expiry_date).toLocaleDateString()}
              </p>
            )}
          </Card>
          <Card className="p-5 bg-card-soft">
            <p className="text-xs uppercase text-muted-foreground">Daily Questions</p>
            <p className="text-2xl font-bold mt-1">{usedToday} / {dailyLimit === null ? "∞" : dailyLimit}</p>
            {dailyLimit !== null && <Progress value={(usedToday / dailyLimit) * 100} className="mt-2" />}
          </Card>
          <Card className="p-5 bg-card-soft">
            <p className="text-xs uppercase text-muted-foreground">Avg Score (last {exams.length})</p>
            <p className="text-2xl font-bold mt-1">{avgScore.toFixed(1)}%</p>
            {exams.length > 0 && (() => {
              const t = tagFor(avgScore);
              return <Badge className={`mt-2 ${t.cls}`}>{t.icon}<span className="ml-1">{t.label}</span></Badge>;
            })()}
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Card className="p-5">
            <h2 className="font-semibold mb-3">Strengths</h2>
            {strengths.length === 0 ? <p className="text-sm text-muted-foreground">Take more tests to see insights.</p> :
              <ul className="space-y-2">{strengths.map(t => (
                <li key={t.topic} className="flex justify-between text-sm">
                  <span>{t.topic}</span>
                  <Badge className="bg-success text-success-foreground">{Math.round(t.correct/t.total*100)}%</Badge>
                </li>
              ))}</ul>
            }
          </Card>
          <Card className="p-5">
            <h2 className="font-semibold mb-3">Weaknesses</h2>
            {weaknesses.length === 0 ? <p className="text-sm text-muted-foreground">No data yet.</p> :
              <ul className="space-y-2">{weaknesses.map(t => (
                <li key={t.topic} className="flex justify-between text-sm">
                  <span>{t.topic}</span>
                  <Badge variant="destructive">{Math.round(t.correct/t.total*100)}%</Badge>
                </li>
              ))}</ul>
            }
          </Card>
        </div>

        <Card className="p-5">
          <h2 className="font-semibold mb-3">Recent Tests</h2>
          {exams.length === 0 ? <p className="text-sm text-muted-foreground">No tests yet — take your first!</p> : (
            <div className="divide-y">
              {exams.map(e => (
                <Link key={e.id} to="/exam/$examId/results" params={{ examId: e.id }} className="flex justify-between py-3 hover:bg-accent/40 rounded px-2 -mx-2">
                  <div>
                    <p className="font-medium">{e.exam_type} • {e.category}</p>
                    <p className="text-xs text-muted-foreground">{e.completed_at && new Date(e.completed_at).toLocaleString()}</p>
                  </div>
                  <Badge variant="secondary">{(e.score_pct ?? 0).toFixed(1)}%</Badge>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </main>
    </>
  );
}
