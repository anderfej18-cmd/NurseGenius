import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { adminUpdateQuestion } from "@/functions/questions.functions";
import type { AdminQuestion } from "@/hooks/admin-questions";
import { questionIssues } from "@/lib/questions";

const OPTIONS = [
  { key: "option_a", label: "Option A" },
  { key: "option_b", label: "Option B" },
  { key: "option_c", label: "Option C" },
  { key: "option_d", label: "Option D" },
] as const;

/** Repair the text, options and answer of one broken question. The rationale is kept as stored. */
export function BrokenQuestionDialog({
  question,
  onClose,
  onSaved,
}: {
  question: AdminQuestion;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(question);
  const [saving, setSaving] = useState(false);
  const stillMissing = questionIssues(draft);

  const change = (field: keyof AdminQuestion, value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));

  const save = async () => {
    setSaving(true);
    try {
      await adminUpdateQuestion({
        data: {
          questionId: question.id,
          content: {
            question_text: draft.question_text,
            option_a: draft.option_a,
            option_b: draft.option_b,
            option_c: draft.option_c,
            option_d: draft.option_d,
            correct_answer: draft.correct_answer,
            rationale: draft.rationale,
          },
        },
      });
    } catch (error) {
      toast.error((error as Error).message);
      setSaving(false);
      return;
    }
    toast.success("Question repaired.");
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <DialogHeader>
            <DialogTitle>Repair this question</DialogTitle>
            <DialogDescription>
              {stillMissing.length === 0
                ? "Nothing is missing now. Save to take it off this list."
                : `Still missing: ${stillMissing.join(", ")}.`}
            </DialogDescription>
          </DialogHeader>
          <Field label="Question">
            {(control) => (
              <Textarea
                {...control}
                rows={3}
                value={draft.question_text}
                onChange={(event) => change("question_text", event.target.value)}
              />
            )}
          </Field>
          {OPTIONS.map(({ key, label }) => (
            <Field key={key} label={label}>
              {(control) => (
                <Input
                  {...control}
                  value={draft[key]}
                  onChange={(event) => change(key, event.target.value)}
                />
              )}
            </Field>
          ))}
          <Field label="Correct answer">
            {(control) => (
              <Select
                value={draft.correct_answer}
                onValueChange={(value) => change("correct_answer", value)}
              >
                <SelectTrigger {...control}>
                  <SelectValue placeholder="Choose A to D" />
                </SelectTrigger>
                <SelectContent>
                  {["A", "B", "C", "D"].map((letter) => (
                    <SelectItem key={letter} value={letter}>
                      {letter}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save repair
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
