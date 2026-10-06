import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Brain, Trophy, Timer, Sparkles, ShieldCheck, GraduationCap } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({ meta: [
    { title: "NurseGenius — RN & RM Exam Practice" },
    { name: "description", content: "Prepare for Nigerian nursing exams with timed RN and RM practice, explanations, and progress tracking." },
    { property: "og:title", content: "NurseGenius — RN & RM Exam Practice" },
    { property: "og:description", content: "Timed nursing exam practice, clear explanations, and progress tracking for RN and RM candidates." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function Index() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user && profile && !profile.onboarded) navigate({ to: "/onboarding" });
  }, [loading, user, profile, navigate]);

  return (
    <>
      <AppHeader />
      <main>
        <section className="container mx-auto px-4 py-20 md:py-28 text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border bg-card-soft px-3 py-1 text-xs font-medium text-muted-foreground shadow-soft">
            <Sparkles className="h-3 w-3 text-primary" />
            AI-powered nursing exam prep
          </div>
          <h1 className="mt-6 text-4xl md:text-6xl font-bold tracking-tight max-w-3xl mx-auto">
            Master your <span className="bg-hero bg-clip-text text-transparent">RN & RM CBT</span> with confidence
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            Practice realistic CBT exams, get instant AI explanations, and track your progress with a system built for nursing students.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {user ? (
              <Button size="lg" asChild className="bg-hero shadow-glow"><Link to="/dashboard">Go to Dashboard</Link></Button>
            ) : (
              <>
                <Button size="lg" asChild className="bg-hero shadow-glow"><Link to="/auth">Get Started Free</Link></Button>
                <Button size="lg" variant="outline" asChild><Link to="/auth">Sign In</Link></Button>
              </>
            )}
          </div>
        </section>

        <section className="container mx-auto px-4 pb-24 grid md:grid-cols-3 gap-6">
          {[
            { icon: Brain, title: "AI Mentor", desc: "Ask Gemini to explain any question — strengths and weaknesses analyzed automatically." },
            { icon: Timer, title: "Realistic CBT", desc: "Timer, flag, navigate, and submit just like the real exam. 80% completion guard built-in." },
            { icon: Trophy, title: "Leaderboards", desc: "Climb the weekly Top 10. Earn trophies, stars, and badges as you grow." },
            { icon: ShieldCheck, title: "Three Tiers", desc: "Novice (free), Erudite, Scholar — choose what fits your study load." },
            { icon: GraduationCap, title: "Topic Insights", desc: "See your strongest and weakest topics so you study smarter." },
            { icon: Sparkles, title: "Built for Nigeria", desc: "Pay easily via Opay; manual verification by our team." },
          ].map((f) => (
            <Card key={f.title} className="p-6 bg-card-soft shadow-soft border-border/60">
              <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center mb-4">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </Card>
          ))}
        </section>
      </main>
    </>
  );
}
