import { useState } from "react";
import { toast } from "sonner";
import { Library } from "lucide-react";
import { ExamTypeField } from "@/components/admin/ExamTypeField";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { importCustomTestQuestions } from "@/functions/custom-tests.functions";
import { fetchTopics } from "@/hooks/topic-data";
import { useServerData } from "@/hooks/use-server-data";
import type { ExamType } from "@/lib/exam-type";

/**
 * Adds a test's uploaded questions to the question bank, under an exam type and a subcategory chosen here.
 * Nothing is copied unless this is confirmed. Questions the bank already holds are skipped, and the
 * result says how many went in and how many were skipped; each import is recorded in the audit log.
 */
export function ImportQuestionsDialog({
  testId,
  title,
  pending,
  defaultExamType,
  onImported,
}: {
  testId: string;
  title: string;
  /** How many uploaded questions have not been imported yet. */
  pending: number;
  defaultExamType: ExamType;
  onImported: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [examType, setExamType] = useState<ExamType>(defaultExamType);
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const existing = useServerData(() => fetchTopics(examType), [examType], open);
  const listId = `topics-${testId}`;
  const clean = topic.trim();

  const confirm = async () => {
    if (clean === "") return;
    setBusy(true);
    try {
      const result = await importCustomTestQuestions({ data: { testId, examType, topic: clean } });
      toast.success(
        `${result.added} added to ${examType}, ${clean}.${result.skipped > 0 ? ` ${result.skipped} skipped because the bank already has them.` : ""}`,
      );
      setOpen(false);
      onImported();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the questions.");
    }
    setBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Library /> Add to question bank
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void confirm();
          }}
        >
          <DialogHeader>
            <DialogTitle>Add “{title}” questions to the bank</DialogTitle>
            <DialogDescription>
              {pending} uploaded {pending === 1 ? "question is" : "questions are"} waiting. They
              become available to students in tests. Questions the bank already holds are skipped.
            </DialogDescription>
          </DialogHeader>
          <ExamTypeField label="Major category" value={examType} onChange={setExamType} />
          <Field
            label="Subcategory"
            required
            hint="Pick an existing subcategory or type a new name."
          >
            {(control) => (
              <>
                <Input
                  {...control}
                  list={listId}
                  maxLength={200}
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                />
                <datalist id={listId}>
                  {existing.data?.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={clean === ""}>
              Add {pending} to {examType}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
