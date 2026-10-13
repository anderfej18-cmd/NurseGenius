import { Link, createFileRoute } from "@tanstack/react-router";
import { Bookmark } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { LoadFailed } from "@/components/app/LoadFailed";
import { SignedInPage } from "@/components/SignedInPage";
import { QuestionPreview } from "@/components/QuestionPreview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { Field } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { addBookmark, listBookmarks, removeBookmark } from "@/functions/bookmarks.functions";
import { usePagedList } from "@/hooks/use-paged-list";

export const Route = createFileRoute("/_app/bookmarks")({
  component: Bookmarks,
  head: () => ({
    meta: [
      { title: "Bookmarks | NurseGenius" },
      { name: "description", content: "Questions you saved, with your own notes." },
    ],
  }),
});

type Page = Awaited<ReturnType<typeof listBookmarks>>;
type Item = Page["items"][number];
const MAX_NOTE = 500;

function Bookmarks() {
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const list = usePagedList<Item>((offset) => {
    if (offset === undefined) setRemoved(new Set());
    return listBookmarks({ data: { limit: 20, ...(offset === undefined ? {} : { offset }) } });
  }, []);
  const { first } = list;
  const items = list.items.filter((i) => !removed.has(i.questionId));

  return (
    <SignedInPage
      title="Bookmarks"
      description="Questions you saved to come back to, with your own notes."
    >
      {() => (
        <>
          {first.error && !first.data && <LoadFailed load={first} label="Your bookmarks" />}
          {first.loading && items.length === 0 && !first.error && (
            <div aria-busy="true" className="flex flex-col gap-4">
              <Skeleton className="h-56 w-full" />
              <Skeleton className="h-56 w-full" />
            </div>
          )}
          {!first.loading && !first.error && items.length === 0 && (
            <EmptyState
              icon={Bookmark}
              title="No bookmarks yet"
              description="Bookmark a question from your results or the Mistake Bank and it is kept here, with a note if you want one."
              action={
                <Button asChild variant="outline">
                  <Link to="/mistakes">Open the Mistake Bank</Link>
                </Button>
              }
            />
          )}
          <ul className="flex flex-col gap-4">
            {items.map((item) => (
              <li key={item.questionId}>
                <BookmarkCard
                  item={item}
                  onRemoved={() => setRemoved((current) => new Set(current).add(item.questionId))}
                />
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

function BookmarkCard({ item, onRemoved }: { item: Item; onRemoved: () => void }) {
  const [note, setNote] = useState(item.note ?? "");
  const [saved, setSaved] = useState(item.note ?? "");
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const q = item.question;

  const saveNote = async () => {
    setBusy("save");
    try {
      await addBookmark({ data: { questionId: item.questionId, note } });
      setSaved(note);
      toast.success("Note saved");
    } catch (error) {
      toast.error((error as Error).message);
    }
    setBusy(null);
  };
  const remove = async () => {
    setBusy("remove");
    try {
      await removeBookmark({ data: { questionId: item.questionId } });
      onRemoved();
    } catch (error) {
      toast.error((error as Error).message);
      setBusy(null);
    }
  };

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <Badge variant="outline">{item.topic}</Badge>
      </div>
      <QuestionPreview
        text={q.question_text}
        options={{ A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d }}
      />
      <Field label="Your note" hint={`${note.length} of ${MAX_NOTE} characters`}>
        {(control) => (
          <Textarea
            {...control}
            value={note}
            maxLength={MAX_NOTE}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          loading={busy === "save"}
          disabled={note === saved}
          onClick={() => void saveNote()}
        >
          Save note
        </Button>
        <Button
          size="sm"
          variant="outline"
          loading={busy === "remove"}
          onClick={() => void remove()}
        >
          Remove
        </Button>
      </div>
    </Card>
  );
}
