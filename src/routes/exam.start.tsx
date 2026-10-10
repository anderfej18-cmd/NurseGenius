import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth, TIER_SESSION_LIMIT } from "@/hooks/use-auth";
import { startExamSession } from "@/functions/sessions.functions";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { fetchTopics } from "@/hooks/topic-data";
import { ALL_AREAS } from "@/lib/exam-rules";
import { SELECTION_CHOICES, SELECTION_LABELS, type SelectionMode } from "@/lib/session-modes";
import { parseStartSearch } from "@/lib/start-search";

export const Route = createFileRoute("/exam/start")({
  component: ExamStart,
  validateSearch: parseStartSearch,
  head: () => ({
    meta: [
      { title: "Start a Practice Exam — NurseGenius" },
      {
        name: "description",
        content:
          "Choose an RN or RM nursing practice exam, study area, question count, and time limit.",
      },
      { property: "og:title", content: "Start a Practice Exam — NurseGenius" },
      { property: "og:description", content: "Set up a timed RN or RM nursing practice exam." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ExamStart() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const preset = Route.useSearch();
  const [examType, setExamType] = useState<"RN" | "RM">(preset.examType ?? "RN");
  const [category, setCategory] = useState(preset.topic ?? ALL_AREAS);
  const [selection, setSelection] = useState<SelectionMode>(preset.selection ?? "random");
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
      if (!preset.examType && profile.exam_preference && profile.exam_preference !== "Both")
        setExamType(profile.exam_preference);
    }
  }, [profile, preset.examType]);

  useEffect(() => {
    (async () => {
      setTopics(await fetchTopics(examType));
    })();
  }, [examType]);

  const start = async () => {
    if (!user || !profile) return;
    setBusy(true);
    try {
      // The server checks the tier and daily limits, picks the questions and creates the exam.
      const { examId, totalQuestions } = await startExamSession({
        data: {
          examType,
          category,
          count,
          minutes,
          selection,
          ...(preset.similarTo === undefined ? {} : { similarTo: preset.similarTo }),
        },
      });
      if (totalQuestions < count) {
        toast.info(`Only ${totalQuestions} complete questions are available for this selection.`);
      }
      navigate({ to: "/exam/$examId", params: { examId } });
    } catch (error) {
      toast.error((error as Error).message || "Failed to start");
      setBusy(false);
    }
  };

  if (!profile)
    return (
      <>
        <AppHeader />
        <div className="p-12 text-center">Loading…</div>
      </>
    );

  return (
    <>
      <AppHeader />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <h1 className="text-3xl font-bold mb-6">Configure Your Test</h1>
        <Card className="p-6 bg-card-soft space-y-6">
          <div>
            <Label>Exam Type</Label>
            <Select value={examType} onValueChange={(v) => setExamType(v as "RN" | "RM")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="RN">RN — Registered Nurse</SelectItem>
                <SelectItem value="RM">RM — Registered Midwife</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Topic / Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_AREAS}>All Areas</SelectItem>
                {topics.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Which questions?</Label>
            {preset.similarTo === undefined ? (
              <>
                <Select value={selection} onValueChange={(v) => setSelection(v as SelectionMode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SELECTION_CHOICES.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {SELECTION_LABELS[mode].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {SELECTION_LABELS[selection].hint}
                </p>
              </>
            ) : (
              <p className="text-sm mt-1">
                {SELECTION_LABELS.similar.label}. {SELECTION_LABELS.similar.hint}
              </p>
            )}
          </div>
          <div>
            <Label>Number of Questions: {count}</Label>
            <Slider
              value={[count]}
              min={10}
              max={TIER_SESSION_LIMIT[profile.tier]}
              step={10}
              onValueChange={(v) => setCount(v[0])}
              className="mt-2"
            />
          </div>
          <div>
            <Label>Time Limit: {minutes} minutes</Label>
            <Slider
              value={[minutes]}
              min={15}
              max={180}
              step={5}
              onValueChange={(v) => setMinutes(v[0])}
              className="mt-2"
            />
          </div>
          <Button onClick={start} disabled={busy} className="w-full bg-hero shadow-glow" size="lg">
            {busy ? "Starting…" : "Begin Test"}
          </Button>
        </Card>
      </main>
    </>
  );
}
