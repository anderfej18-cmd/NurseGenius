import { Link, createFileRoute } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { LoadFailed } from "@/components/app/LoadFailed";
import { SignedInPage } from "@/components/SignedInPage";
import { QuestionPreview } from "@/components/QuestionPreview";
import { SimilarQuestions } from "@/components/SimilarQuestions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addBookmark } from "@/functions/bookmarks.functions";
import { listMistakes } from "@/functions/mistakes.functions";
import { usePagedList } from "@/hooks/use-paged-list";

export const Route = createFileRoute("/_app/mistakes")({
  component: Mistakes,
  head: () => ({
    meta: [
      { title: "Mistake Bank | NurseGenius" },
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
  const list = usePagedList<Item>(
    (offset) =>
      listMistakes({ data: { view, limit: 20, ...(offset === undefined ? {} : { offset }) } }),
    [view],
  );
  const { first, items } = list;

  return (
    <SignedInPage
      title="Mistake Bank"
      description="Questions you have answered wrongly. Review them, then start a mistake-review test."
    >
      {() => (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs value={view} onValueChange={(v) => setView(v as View)}>
              <TabsList aria-label="Which mistakes to show" className="max-w-full overflow-x-auto">
                {VIEWS.map(({ value, label }) => (
                  <TabsTrigger key={value} value={value}>
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Button asChild size="sm">
              <Link to="/exam/start" search={{ selection: "mistakes" }}>
                Review my mistakes
              </Link>
            </Button>
          </div>

          {first.error && !first.data && <LoadFailed load={first} label="Your mistakes" />}
          {first.loading && items.length === 0 && !first.error && (
            <div aria-busy="true" className="flex flex-col gap-4">
              <Skeleton className="h-56 w-full" />
              <Skeleton className="h-56 w-full" />
            </div>
          )}
          {!first.loading && !first.error && items.length === 0 && (
            <EmptyState
              icon={RotateCcw}
              title="No mistakes here"
              description="Questions you miss in a finished test appear in this list, so you can go back to them."
              action={
                <Button asChild>
                  <Link to="/exam/start">Take a test</Link>
                </Button>
              }
            />
          )}

          <ul className="flex flex-col gap-4">
            {items.map((item) => (
              <li key={item.questionId}>
                <MistakeCard item={item} />
              </li>
            ))}
          </ul>
          {list.hasMore && (
            <div>
              <Button
                variant="outline"
                loading={list.loadingMore}
                onClick={() => void list.loadMore()}
              >
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </SignedInPage>
  );
}

function MistakeCard({ item }: { item: Item }) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSimilar, setShowSimilar] = useState(false);
  const bookmark = async () => {
    setSaving(true);
    try {
      await addBookmark({ data: { questionId: item.questionId } });
      setSaved(true);
      toast.success("Bookmarked");
    } catch (error) {
      toast.error((error as Error).message);
    }
    setSaving(false);
  };
  const q = item.question;
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={item.examType === "RM" ? "rm" : "rn"}>{item.examType}</Badge>
        <Badge variant="outline">{item.topic}</Badge>
        <Badge variant="secondary">
          Missed {item.misses} of {item.attempts}
        </Badge>
        {item.unresolved && <Badge variant="warning">Not yet corrected</Badge>}
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
          <p className="rounded-md bg-sunken p-3 text-sm">
            <span className="font-semibold">Why: </span>
            {q.rationale}
          </p>
        )
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          loading={saving}
          disabled={saved}
          onClick={() => void bookmark()}
        >
          {saved ? "Bookmarked" : "Bookmark"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={showSimilar}
          onClick={() => setShowSimilar((open) => !open)}
        >
          {showSimilar ? "Hide similar questions" : "Similar questions"}
        </Button>
      </div>
      {showSimilar && (
        <SimilarQuestions
          questionId={item.questionId}
          examType={item.examType}
          topic={item.topic}
        />
      )}
    </Card>
  );
}
