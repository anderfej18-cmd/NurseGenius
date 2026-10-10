import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { SignedInPage } from "@/components/SignedInPage";
import { QuestionPreview } from "@/components/QuestionPreview";
import { SimilarQuestions } from "@/components/SimilarQuestions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addBookmark } from "@/functions/bookmarks.functions";
import { listMistakes } from "@/functions/mistakes.functions";
import { useServerData } from "@/hooks/use-server-data";

export const Route = createFileRoute("/mistakes")({
  component: Mistakes,
  head: () => ({
    meta: [
      { title: "Mistake Bank — NurseGenius" },
      { name: "description", content: "Review the nursing questions you have missed." },
    ],
  }),
});

type View = "all" | "most_repeated" | "recent" | "repeatedly_failed";
type Page = Awaited<ReturnType<typeof listMistakes>>;
type Item = Page["items"][number];

const VIEWS: ReadonlyArray<{ value: View; label: string }> = [
  { value: "all", label: "All" },
  { value: "recent", label: "This week" },
  { value: "most_repeated", label: "Most missed" },
  { value: "repeatedly_failed", label: "Still failing" },
];

function Mistakes() {
  const [view, setView] = useState<View>("all");
  const [extra, setExtra] = useState<Item[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const first = useServerData(async () => {
    const page = await listMistakes({ data: { view, limit: 20 } });
    setExtra([]);
    setNext(page.nextOffset);
    return page;
  }, [view]);

  const more = async () => {
    if (next === null) return;
    try {
      const page = await listMistakes({ data: { view, limit: 20, offset: next } });
      setExtra((current) => [...current, ...page.items]);
      setNext(page.nextOffset);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const items = [...(first.data?.items ?? []), ...extra];

  return (
    <SignedInPage
      title="Mistake Bank"
      description="Questions you have answered wrongly. Review them, then start a mistake-review test."
    >
      {() => (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs value={view} onValueChange={(v) => setView(v as View)}>
              <TabsList>
                {VIEWS.map(({ value, label }) => (
                  <TabsTrigger key={value} value={value}>
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Button asChild size="sm" className="bg-hero">
              <Link to="/exam/start">Review my mistakes</Link>
            </Button>
          </div>

          {first.error && <p className="text-destructive text-sm">{first.error}</p>}
          {first.loading && <p className="text-muted-foreground text-sm">Loading…</p>}
          {!first.loading && !first.error && items.length === 0 && (
            <Card className="p-6 text-center text-muted-foreground text-sm">
              Nothing here yet. Questions you miss in a finished test will appear in this list.
            </Card>
          )}

          {items.map((item) => (
            <MistakeCard key={item.questionId} item={item} />
          ))}
          {next !== null && (
            <Button variant="outline" onClick={() => void more()}>
              Load more
            </Button>
          )}
        </>
      )}
    </SignedInPage>
  );
}

function MistakeCard({ item }: { item: Item }) {
  const [saved, setSaved] = useState(false);
  const bookmark = async () => {
    try {
      await addBookmark({ data: { questionId: item.questionId } });
      setSaved(true);
      toast.success("Bookmarked");
    } catch (error) {
      toast.error((error as Error).message);
    }
  };
  const q = item.question;
  return (
    <Card className="p-5 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{item.topic}</Badge>
        <Badge variant="secondary">
          Missed {item.misses} of {item.attempts}
        </Badge>
        {item.unresolved && (
          <Badge className="bg-warning text-warning-foreground">Not yet corrected</Badge>
        )}
      </div>
      <QuestionPreview
        text={q.question_text}
        options={{ A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d }}
        correct={item.answerWithheld ? null : q.correct_answer}
        chosen={item.lastAnswer}
      />
      {item.answerWithheld ? (
        <p className="text-sm text-muted-foreground">
          This question is part of the test you are taking, so its answer is hidden until you
          submit.
        </p>
      ) : (
        q.rationale && (
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold">Why: </span>
            {q.rationale}
          </p>
        )
      )}
      <Button size="sm" variant="outline" disabled={saved} onClick={() => void bookmark()}>
        {saved ? "Bookmarked" : "Bookmark"}
      </Button>
      <SimilarQuestions questionId={item.questionId} examType={item.examType} topic={item.topic} />
    </Card>
  );
}
