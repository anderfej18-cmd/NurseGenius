import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { SignedInPage } from "@/components/SignedInPage";
import { QuestionPreview } from "@/components/QuestionPreview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { addBookmark, listBookmarks, removeBookmark } from "@/functions/bookmarks.functions";
import { useServerData } from "@/hooks/use-server-data";

export const Route = createFileRoute("/bookmarks")({
  component: Bookmarks,
  head: () => ({
    meta: [
      { title: "Bookmarks — NurseGenius" },
      { name: "description", content: "Questions you saved, with your own notes." },
    ],
  }),
});

type Page = Awaited<ReturnType<typeof listBookmarks>>;
type Item = Page["items"][number];
const MAX_NOTE = 500;

function Bookmarks() {
  const [extra, setExtra] = useState<Item[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const first = useServerData(async () => {
    const page = await listBookmarks({ data: { limit: 20 } });
    setExtra([]);
    setRemoved(new Set());
    setNext(page.nextOffset);
    return page;
  }, []);

  const more = async () => {
    if (next === null) return;
    try {
      const page = await listBookmarks({ data: { limit: 20, offset: next } });
      setExtra((current) => [...current, ...page.items]);
      setNext(page.nextOffset);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const items = [...(first.data?.items ?? []), ...extra].filter((i) => !removed.has(i.questionId));

  return (
    <SignedInPage
      title="Bookmarks"
      description="Questions you saved to come back to, with your own notes."
    >
      {() => (
        <>
          {first.error && <p className="text-destructive text-sm">{first.error}</p>}
          {first.loading && <p className="text-muted-foreground text-sm">Loading…</p>}
          {!first.loading && !first.error && items.length === 0 && (
            <Card className="p-6 text-center text-muted-foreground text-sm">
              No bookmarks yet. Bookmark a question from your results or the Mistake Bank.
            </Card>
          )}
          {items.map((item) => (
            <BookmarkCard
              key={item.questionId}
              item={item}
              onRemoved={() => setRemoved((current) => new Set(current).add(item.questionId))}
            />
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

function BookmarkCard({ item, onRemoved }: { item: Item; onRemoved: () => void }) {
  const [note, setNote] = useState(item.note ?? "");
  const [saved, setSaved] = useState(item.note ?? "");
  const q = item.question;

  const saveNote = async () => {
    try {
      await addBookmark({ data: { questionId: item.questionId, note } });
      setSaved(note);
      toast.success("Note saved");
    } catch (error) {
      toast.error((error as Error).message);
    }
  };
  const remove = async () => {
    try {
      await removeBookmark({ data: { questionId: item.questionId } });
      onRemoved();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <Card className="p-5 space-y-3">
      <Badge variant="outline">{item.topic}</Badge>
      <QuestionPreview
        text={q.question_text}
        options={{ A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d }}
      />
      <div>
        <label className="text-sm font-medium" htmlFor={`note-${item.questionId}`}>
          Your note
        </label>
        <Textarea
          id={`note-${item.questionId}`}
          value={note}
          maxLength={MAX_NOTE}
          onChange={(event) => setNote(event.target.value)}
          className="mt-1"
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={note === saved} onClick={() => void saveNote()}>
          Save note
        </Button>
        <Button size="sm" variant="outline" onClick={() => void remove()}>
          Remove
        </Button>
      </div>
    </Card>
  );
}
