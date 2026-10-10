import { useState } from "react";
import { toast } from "sonner";
import { SubtopicManager } from "@/components/admin/SubtopicManager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  adminListQuestions,
  adminListSubtopics,
  adminRestoreQuestion,
  adminRetireQuestion,
  adminUpdateQuestion,
} from "@/functions/questions.functions";
import { useServerData } from "@/hooks/use-server-data";
import {
  type Difficulty,
  changedFields,
  formatTags,
  parseTags,
  toDifficulty,
} from "@/lib/admin-view";
import { ALL_AREAS } from "@/lib/exam-rules";
import { fetchTopics } from "@/hooks/topic-data";

type Row = Awaited<ReturnType<typeof adminListQuestions>>["items"][number];
type Subtopics = Awaited<ReturnType<typeof adminListSubtopics>>;
type Status = "active" | "retired" | "all";
const DIFFICULTIES = ["easy", "medium", "hard"] as const;
const PAGE = 25;

const selectClass = "h-10 rounded-md border bg-background px-2 text-sm";

/** Browse the bank by exam type, topic and status; set difficulty, tags and subtopic; retire and restore. */
export function QuestionBankTab() {
  const [examType, setExamType] = useState<"RN" | "RM">("RN");
  const [topic, setTopic] = useState(ALL_AREAS);
  const [status, setStatus] = useState<Status>("active");
  const [more, setMore] = useState<Row[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);

  const topics = useServerData(() => fetchTopics(examType), [examType]);
  const subtopics = useServerData(
    () => adminListSubtopics({ data: { examType, ...(topic === ALL_AREAS ? {} : { topic }) } }),
    [examType, topic],
  );
  const first = useServerData(async () => {
    const page = await adminListQuestions({
      data: { examType, ...(topic === ALL_AREAS ? {} : { topics: [topic] }), status, limit: PAGE },
    });
    setMore([]);
    setCursor(page.nextCursor);
    return page;
  }, [examType, topic, status]);

  const loadMore = async () => {
    if (cursor === null) return;
    try {
      const page = await adminListQuestions({
        data: {
          examType,
          ...(topic === ALL_AREAS ? {} : { topics: [topic] }),
          status,
          limit: PAGE,
          cursor,
        },
      });
      setMore((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const rows = [...(first.data?.items ?? []), ...more];

  return (
    <div className="mt-4 space-y-4">
      <Card className="p-4 grid sm:grid-cols-3 gap-3">
        <div>
          <Label htmlFor="bank-exam">Exam type</Label>
          <select
            id="bank-exam"
            className={`${selectClass} w-full`}
            value={examType}
            onChange={(event) => {
              setExamType(event.target.value === "RM" ? "RM" : "RN");
              setTopic(ALL_AREAS);
            }}
          >
            <option value="RN">RN</option>
            <option value="RM">RM</option>
          </select>
        </div>
        <div>
          <Label htmlFor="bank-topic">Topic</Label>
          <select
            id="bank-topic"
            className={`${selectClass} w-full`}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          >
            <option value={ALL_AREAS}>All topics</option>
            {topics.data?.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="bank-status">Show</Label>
          <select
            id="bank-status"
            className={`${selectClass} w-full`}
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
          >
            <option value="active">In use</option>
            <option value="retired">Retired</option>
            <option value="all">Both</option>
          </select>
        </div>
      </Card>

      {topic !== ALL_AREAS && (
        <SubtopicManager
          examType={examType}
          topic={topic}
          onChanged={() => void subtopics.reload()}
        />
      )}

      {first.error && <p className="text-destructive text-sm">{first.error}</p>}
      {first.loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!first.loading && !first.error && rows.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">No questions match.</Card>
      )}
      {rows.map((row) => (
        <QuestionRow key={row.id} row={row} subtopics={subtopics.data ?? []} />
      ))}
      {cursor !== null && (
        <Button variant="outline" onClick={() => void loadMore()}>
          Load more
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        Questions are retired, never deleted, so tests students have already taken stay intact.
      </p>
    </div>
  );
}

function QuestionRow({ row, subtopics }: { row: Row; subtopics: Subtopics }) {
  const [saved, setSaved] = useState({
    difficulty: row.difficulty,
    tags: row.tags,
    subtopicId: row.subtopic_id,
    status: row.status,
  });
  const [difficulty, setDifficulty] = useState<Difficulty | null>(row.difficulty);
  const [tagText, setTagText] = useState(formatTags(row.tags));
  const [subtopicId, setSubtopicId] = useState<string | null>(row.subtopic_id);
  const [busy, setBusy] = useState(false);

  const edited = { difficulty, tags: parseTags(tagText), subtopicId };
  const changes = changedFields(saved, edited);
  const dirty = Object.keys(changes).length > 0;
  const mine = subtopics.filter((s) => s.examType === row.exam_type && s.topic === row.topic);
  const retired = saved.status === "retired";

  const save = async () => {
    setBusy(true);
    try {
      await adminUpdateQuestion({ data: { questionId: row.id, ...changes } });
      setSaved({ ...saved, difficulty, tags: edited.tags, subtopicId });
      toast.success("Saved");
    } catch (error) {
      toast.error((error as Error).message);
    }
    setBusy(false);
  };

  const toggleStatus = async () => {
    setBusy(true);
    try {
      if (retired) await adminRestoreQuestion({ data: { questionId: row.id } });
      else await adminRetireQuestion({ data: { questionId: row.id } });
      setSaved({ ...saved, status: retired ? "active" : "retired" });
    } catch (error) {
      toast.error((error as Error).message);
    }
    setBusy(false);
  };

  return (
    <Card className={`p-4 space-y-3 ${retired ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{row.topic}</Badge>
        <Badge variant={retired ? "destructive" : "secondary"}>
          {retired ? "Retired" : "In use"}
        </Badge>
        <span className="text-xs text-muted-foreground">Answer {row.correct_answer}</span>
      </div>
      <p className="text-sm font-medium">{row.question_text}</p>
      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <Label htmlFor={`d-${row.id}`}>Difficulty</Label>
          <select
            id={`d-${row.id}`}
            className={`${selectClass} w-full`}
            value={difficulty ?? ""}
            onChange={(event) => setDifficulty(toDifficulty(event.target.value))}
          >
            <option value="">Not set</option>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor={`t-${row.id}`}>Tags (comma separated)</Label>
          <Input
            id={`t-${row.id}`}
            value={tagText}
            onChange={(event) => setTagText(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor={`s-${row.id}`}>Subtopic</Label>
          <select
            id={`s-${row.id}`}
            className={`${selectClass} w-full`}
            value={subtopicId ?? ""}
            onChange={(event) =>
              setSubtopicId(event.target.value === "" ? null : event.target.value)
            }
          >
            <option value="">None</option>
            {mine.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={!dirty || busy} onClick={() => void save()}>
          Save changes
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void toggleStatus()}>
          {retired ? "Restore" : "Retire"}
        </Button>
      </div>
    </Card>
  );
}
