import { Library } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ExamTypeField } from "@/components/admin/ExamTypeField";
import { SubtopicManager } from "@/components/admin/SubtopicManager";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { LoadFailed } from "@/components/app/LoadFailed";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  adminListQuestions,
  adminListSubtopics,
  adminRestoreQuestion,
  adminRetireQuestion,
  adminUpdateQuestion,
} from "@/functions/questions.functions";
import type { AdminQuestion } from "@/hooks/admin-questions";
import { fetchTopics } from "@/hooks/topic-data";
import { useServerData } from "@/hooks/use-server-data";
import {
  type Difficulty,
  changedFields,
  formatTags,
  parseTags,
  toDifficulty,
} from "@/lib/admin-view";
import { ALL_AREAS } from "@/lib/exam-rules";
import type { ExamType } from "@/lib/exam-type";

type Subtopics = Awaited<ReturnType<typeof adminListSubtopics>>;
type Status = "active" | "retired" | "all";
const DIFFICULTIES = ["easy", "medium", "hard"] as const;
const PAGE = 25;
/** Select items cannot carry an empty value, so "not set" and "none" use this stand-in. */
const UNSET = "__unset";

/** Browse the bank by exam type, topic and status; set difficulty, tags and subtopic; retire and restore. */
export function QuestionBankTab() {
  const [examType, setExamType] = useState<ExamType>("RN");
  const [topic, setTopic] = useState(ALL_AREAS);
  const [status, setStatus] = useState<Status>("active");
  const [more, setMore] = useState<AdminQuestion[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const topicFilter = topic === ALL_AREAS ? {} : { topics: [topic] };
  const topics = useServerData(() => fetchTopics(examType), [examType]);
  const subtopics = useServerData(
    () => adminListSubtopics({ data: { examType, ...(topic === ALL_AREAS ? {} : { topic }) } }),
    [examType, topic],
  );
  const first = useServerData(async () => {
    const page = await adminListQuestions({
      data: { examType, ...topicFilter, status, limit: PAGE },
    });
    setMore([]);
    setCursor(page.nextCursor);
    return page;
  }, [examType, topic, status]);

  const loadMore = async () => {
    if (cursor === null) return;
    setLoadingMore(true);
    try {
      const page = await adminListQuestions({
        data: { examType, ...topicFilter, status, limit: PAGE, cursor },
      });
      setMore((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch (error) {
      toast.error((error as Error).message);
    }
    setLoadingMore(false);
  };

  const rows = [...(first.data?.items ?? []), ...more];

  return (
    <div className="flex flex-col gap-4">
      <Card className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
        <ExamTypeField
          value={examType}
          onChange={(next) => {
            setExamType(next);
            setTopic(ALL_AREAS);
          }}
        />
        <Field label="Topic">
          {(control) => (
            <Select value={topic} onValueChange={setTopic}>
              <SelectTrigger {...control}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_AREAS}>All topics</SelectItem>
                {topics.data?.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field label="Show">
          {(control) => (
            <Select value={status} onValueChange={(next) => setStatus(next as Status)}>
              <SelectTrigger {...control}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">In use</SelectItem>
                <SelectItem value="retired">Retired</SelectItem>
                <SelectItem value="all">Both</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Field>
      </Card>

      {topic !== ALL_AREAS && (
        <SubtopicManager
          examType={examType}
          topic={topic}
          onChanged={() => void subtopics.reload()}
        />
      )}

      {first.error && <LoadFailed load={first} label="The questions" />}
      {first.loading && !first.data && (
        <div aria-busy="true" className="flex flex-col gap-3">
          <span className="sr-only">Loading questions</span>
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}
      {first.data && rows.length === 0 && (
        <EmptyState
          icon={Library}
          title="No questions match"
          description="Try another topic, or show retired questions as well."
        />
      )}
      {rows.map((row) => (
        <QuestionRow key={row.id} row={row} subtopics={subtopics.data ?? []} />
      ))}
      {cursor !== null && (
        <div>
          <Button variant="outline" loading={loadingMore} onClick={() => void loadMore()}>
            Load more
          </Button>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        Questions are retired, never deleted, so tests students have already taken stay intact.
      </p>
    </div>
  );
}

function QuestionRow({ row, subtopics }: { row: AdminQuestion; subtopics: Subtopics }) {
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
      toast.success("Saved.");
    } catch (error) {
      toast.error((error as Error).message);
    }
    setBusy(false);
  };

  const setStatus = async (next: "active" | "retired"): Promise<boolean> => {
    setBusy(true);
    try {
      if (next === "active") await adminRestoreQuestion({ data: { questionId: row.id } });
      else await adminRetireQuestion({ data: { questionId: row.id } });
      setSaved({ ...saved, status: next });
      toast.success(next === "active" ? "Question restored." : "Question retired.");
      return true;
    } catch (error) {
      toast.error((error as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{row.topic}</Badge>
        <Badge variant={retired ? "warning" : "success"}>{retired ? "Retired" : "In use"}</Badge>
        <span className="text-xs text-muted-foreground">Answer {row.correct_answer}</span>
      </div>
      <p className={retired ? "text-sm font-medium text-muted-foreground" : "text-sm font-medium"}>
        {row.question_text}
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Difficulty">
          {(control) => (
            <Select
              value={difficulty ?? UNSET}
              onValueChange={(next) => setDifficulty(toDifficulty(next))}
            >
              <SelectTrigger {...control}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>Not set</SelectItem>
                {DIFFICULTIES.map((d) => (
                  <SelectItem key={d} value={d} className="capitalize">
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field label="Tags" hint="Separate tags with commas.">
          {(control) => (
            <Input
              {...control}
              value={tagText}
              onChange={(event) => setTagText(event.target.value)}
            />
          )}
        </Field>
        <Field label="Subtopic">
          {(control) => (
            <Select
              value={subtopicId ?? UNSET}
              onValueChange={(next) => setSubtopicId(next === UNSET ? null : next)}
            >
              <SelectTrigger {...control}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>None</SelectItem>
                {mine.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!dirty || busy} onClick={() => void save()}>
          Save changes
        </Button>
        {retired ? (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void setStatus("active")}
          >
            Restore
          </Button>
        ) : (
          <ConfirmDialog
            title="Retire this question?"
            description="It stops being used in new tests. Tests students already took keep it, and you can restore it here."
            confirmLabel="Retire question"
            destructive
            onConfirm={() => setStatus("retired")}
            trigger={(open) => (
              <Button size="sm" variant="outline" disabled={busy} onClick={open}>
                Retire
              </Button>
            )}
          />
        )}
      </div>
    </Card>
  );
}
