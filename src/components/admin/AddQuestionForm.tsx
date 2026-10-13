import { useState } from "react";
import { toast } from "sonner";
import { Section } from "@/components/app/Section";
import { Button } from "@/components/ui/button";
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
import { adminCreateQuestion } from "@/functions/questions.functions";
import type { ExamType } from "@/lib/exam-type";
import { missingOptionIssue, questionIssues } from "@/lib/questions";

const LETTERS = ["A", "B", "C", "D"] as const;
type Letter = (typeof LETTERS)[number];

interface Draft {
  text: string;
  options: Record<Letter, string>;
  answer: Letter;
  rationale: string;
}

const EMPTY: Draft = {
  text: "",
  options: { A: "", B: "", C: "", D: "" },
  answer: "A",
  rationale: "",
};

/** Adds one complete question to the chosen exam type and subcategory. */
export function AddQuestionForm({
  examType,
  topic,
  onAdded,
}: {
  examType: ExamType;
  topic: string;
  onAdded: (topic: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  const issues = questionIssues({
    question_text: draft.text,
    option_a: draft.options.A,
    option_b: draft.options.B,
    option_c: draft.options.C,
    option_d: draft.options.D,
    correct_answer: draft.answer,
  });
  const error = (name: string, message: string) =>
    tried && issues.includes(name) ? message : undefined;

  const add = async () => {
    setTried(true);
    if (topic === "") {
      toast.error("Choose or name a subcategory first.");
      return;
    }
    if (issues.length > 0) return;
    setBusy(true);
    try {
      await adminCreateQuestion({
        data: {
          examType,
          topic,
          content: {
            question_text: draft.text,
            option_a: draft.options.A,
            option_b: draft.options.B,
            option_c: draft.options.C,
            option_d: draft.options.D,
            correct_answer: draft.answer,
            rationale: draft.rationale,
          },
        },
      });
    } catch (failure) {
      toast.error((failure as Error).message);
      setBusy(false);
      return;
    }
    setBusy(false);
    toast.success("Question added.");
    setDraft(EMPTY);
    setTried(false);
    onAdded(topic);
  };

  return (
    <Section
      title="Add one question"
      description={
        topic === ""
          ? "Choose or name a subcategory above first."
          : `It goes into ${examType}, ${topic}.`
      }
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <Field
          label="Question"
          required
          error={error("question text", "Write the question itself, not only its number.")}
        >
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              maxLength={5000}
              value={draft.text}
              onChange={(event) => setDraft({ ...draft, text: event.target.value })}
            />
          )}
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {LETTERS.map((letter) => (
            <Field
              key={letter}
              label={`Option ${letter}`}
              required
              error={error(missingOptionIssue(letter), `Option ${letter} cannot be empty.`)}
            >
              {(control) => (
                <Input
                  {...control}
                  maxLength={1000}
                  value={draft.options[letter]}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      options: { ...draft.options, [letter]: event.target.value },
                    })
                  }
                />
              )}
            </Field>
          ))}
        </div>
        <Field label="Correct answer">
          {(control) => (
            <Select
              value={draft.answer}
              onValueChange={(answer) => setDraft({ ...draft, answer: answer as Letter })}
            >
              <SelectTrigger {...control} className="sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LETTERS.map((letter) => (
                  <SelectItem key={letter} value={letter}>
                    {letter}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field label="Explanation" hint="Shown to students after they submit a test. Optional.">
          {(control) => (
            <Textarea
              {...control}
              rows={2}
              maxLength={5000}
              value={draft.rationale}
              onChange={(event) => setDraft({ ...draft, rationale: event.target.value })}
            />
          )}
        </Field>
        <div>
          <Button type="submit" loading={busy}>
            Add question
          </Button>
        </div>
      </form>
    </Section>
  );
}
