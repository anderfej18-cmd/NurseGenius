import { CheckCircle2, Copy, Flag, MinusCircle, Sparkles, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { QuestionActions } from "@/components/QuestionActions";
import { QuestionHelp } from "@/components/QuestionHelp";
import { SimilarQuestions } from "@/components/SimilarQuestions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OPTION_LETTERS } from "@/lib/exam-runtime";
import { statusOf, type ResultStatus } from "@/lib/results-view";
import { selectionReasonText } from "@/lib/session-modes";
import { cn } from "@/lib/utils";

export interface ReviewQuestion {
  id: string;
  question_text: string;
  correct_answer: string;
  rationale: string | null;
  topic: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
}

export interface ReviewItem {
  user_answer: string | null;
  is_correct: boolean | null;
  flagged: boolean;
  position: number;
  selection_reason?: string | null;
  questions: ReviewQuestion;
}

const STATUS: Record<
  ResultStatus,
  { label: string; variant: "success" | "destructive" | "secondary"; Icon: typeof CheckCircle2 }
> = {
  correct: { label: "Correct", variant: "success", Icon: CheckCircle2 },
  wrong: { label: "Wrong", variant: "destructive", Icon: XCircle },
  skipped: { label: "Skipped", variant: "secondary", Icon: MinusCircle },
};

type Panel = "ai" | "similar" | null;

/**
 * One question of a finished test: what was asked, which answer was right and which was chosen, the
 * explanation, and the tools that need a finished question (AI help, similar questions, bookmark,
 * report, copy). The tools open under the question on request, so a long review stays readable.
 */
export function ResultQuestion({
  item,
  number,
  examId,
  examType,
}: {
  item: ReviewItem;
  number: number;
  examId: string;
  examType: "RN" | "RM";
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [copied, setCopied] = useState(false);
  const question = item.questions;
  const status = statusOf(item);
  const { label, variant, Icon } = STATUS[status];
  const reason = selectionReasonText(item.selection_reason ?? null);

  const copy = async () => {
    const text = `${question.question_text}\n\nA) ${question.option_a}\nB) ${question.option_b}\nC) ${question.option_c}\nD) ${question.option_d}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to the clipboard.");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy. Select the text and copy it instead.");
    }
  };

  const toggle = (next: Exclude<Panel, null>) =>
    setPanel((current) => (current === next ? null : next));

  return (
    <Card id={`question-${number}`} className="flex scroll-mt-32 flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Question {number} · {question.topic}
        </p>
        <div className="flex items-center gap-2">
          {item.flagged && (
            <Badge variant="warning">
              <Flag className="size-3" fill="currentColor" aria-hidden="true" />
              You flagged this
            </Badge>
          )}
          <Badge variant={variant}>
            <Icon className="size-3.5" aria-hidden="true" />
            {label}
          </Badge>
        </div>
      </div>

      <p className="text-base font-medium leading-relaxed md:text-lg">{question.question_text}</p>
      {reason && <p className="-mt-2 text-xs text-muted-foreground">{reason}</p>}

      <ul className="flex flex-col gap-2">
        {OPTION_LETTERS.map((letter) => {
          const correct = question.correct_answer === letter;
          const chosen = item.user_answer === letter;
          const text = question[`option_${letter.toLowerCase()}` as "option_a"];
          return (
            <li
              key={letter}
              className={cn(
                "flex items-start gap-3 rounded-md border px-3.5 py-3 text-sm md:text-base",
                correct && "border-success bg-success-soft",
                chosen && !correct && "border-destructive bg-destructive-soft",
                !correct && !chosen && "border-border bg-card",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-sm text-xs font-semibold",
                  correct
                    ? "bg-success text-success-foreground"
                    : chosen
                      ? "bg-destructive text-destructive-foreground"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {letter}
              </span>
              <span className="min-w-0 flex-1 leading-relaxed">
                <span className="sr-only">{letter}. </span>
                {text}
              </span>
              {(correct || chosen) && (
                <span
                  className={cn(
                    "flex shrink-0 items-center gap-1 text-xs font-medium",
                    correct ? "text-success" : "text-destructive",
                  )}
                >
                  {correct ? (
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                  ) : (
                    <XCircle className="size-4" aria-hidden="true" />
                  )}
                  {correct && chosen
                    ? "Your answer, correct"
                    : correct
                      ? "Correct answer"
                      : "Your answer"}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {question.rationale && (
        <div className="rounded-md bg-sunken p-4">
          <h3 className="mb-1 font-sans text-sm font-semibold tracking-normal">Why</h3>
          <p className="text-sm leading-relaxed md:text-base">{question.rationale}</p>
        </div>
      )}

      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label={`Tools for question ${number}`}
      >
        <Button
          size="sm"
          variant={panel === "ai" ? "secondary" : "outline"}
          aria-expanded={panel === "ai"}
          onClick={() => toggle("ai")}
        >
          <Sparkles />
          Ask the AI tutor
        </Button>
        <Button
          size="sm"
          variant={panel === "similar" ? "secondary" : "outline"}
          aria-expanded={panel === "similar"}
          onClick={() => toggle("similar")}
        >
          Similar questions
        </Button>
        <QuestionActions questionId={question.id} />
        <Button size="sm" variant="outline" onClick={() => void copy()}>
          <Copy />
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      {panel === "ai" && (
        <QuestionHelp
          where={{ kind: "exam", examId }}
          questionId={question.id}
          answeredWrong={status === "wrong"}
          rationale={question.rationale}
        />
      )}
      {panel === "similar" && (
        <SimilarQuestions questionId={question.id} examType={examType} topic={question.topic} />
      )}
    </Card>
  );
}
