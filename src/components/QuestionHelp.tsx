import { Sparkles } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type ExplanationTarget,
  type HelpIntent,
  followUpProblem,
  helpChoicesFor,
  requestExplanation,
  FOLLOW_UP_MAX,
} from "@/lib/ask-ai";

type Where =
  | { kind: "exam"; examId: string }
  | { kind: "shared"; attemptId: string; accessKey: string };

interface Props {
  where: Where;
  questionId: string;
  /** The student answered and got it wrong: "Why was I wrong?" is offered. */
  answeredWrong: boolean;
  /** The question's official explanation, shown when the AI cannot answer. */
  rationale?: string | null;
}

interface Answer {
  readonly label: string;
  readonly text: string;
}

/**
 * AI help on one finished question: explain, simplify, compare the options, why the student was wrong,
 * and a short follow-up question. The server decides whether this question may be explained; this
 * only asks. Answers are kept on screen and not stored.
 */
export function QuestionHelp({ where, questionId, answeredWrong, rationale }: Props) {
  const [followUp, setFollowUp] = useState("");
  const [loading, setLoading] = useState<HelpIntent | "follow_up" | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  const ask = async (intent: HelpIntent, label: string, question?: string) => {
    setLoading(question === undefined ? intent : "follow_up");
    setProblem(null);
    try {
      const target: ExplanationTarget = {
        ...where,
        questionId,
        intent,
        ...(question === undefined ? {} : { followUp: question }),
      };
      const text = await requestExplanation(target);
      setAnswers((current) => [...current, { label, text }]);
      if (question !== undefined) setFollowUp("");
    } catch (error) {
      setProblem((error as Error).message || "The AI tutor could not answer.");
    }
    setLoading(null);
  };

  const sendFollowUp = () => {
    const invalid = followUpProblem(followUp);
    if (invalid !== null) return setProblem(invalid);
    if (followUp.trim() !== "")
      void ask("explain", `You asked: ${followUp.trim()}`, followUp.trim());
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-sunken p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Sparkles aria-hidden="true" className="size-4 text-primary" />
          Ask the AI tutor
        </span>
        {helpChoicesFor(answeredWrong).map((choice) => (
          <Button
            key={choice.intent}
            size="sm"
            variant="outline"
            disabled={loading !== null}
            loading={loading === choice.intent}
            onClick={() => void ask(choice.intent, choice.label)}
          >
            {choice.label}
          </Button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={followUp}
          maxLength={FOLLOW_UP_MAX + 50}
          placeholder="Ask your own question about this one"
          aria-label="Ask a follow-up question about this question"
          onChange={(event) => setFollowUp(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && sendFollowUp()}
        />
        <Button
          disabled={loading !== null || followUp.trim() === ""}
          loading={loading === "follow_up"}
          onClick={sendFollowUp}
        >
          Ask
        </Button>
      </div>
      {problem && (
        <Alert variant="destructive">
          <p>{problem}</p>
          {rationale && <p>The official explanation above is still available.</p>}
        </Alert>
      )}
      {answers.map((answer, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-md border bg-card p-4 text-sm">
          <Badge variant="info" className="w-fit">
            AI-assisted
          </Badge>
          <p className="font-medium">{answer.label}</p>
          <p className="whitespace-pre-wrap leading-relaxed">{answer.text}</p>
        </div>
      ))}
      {answers.length > 0 && (
        <p className="text-xs text-muted-foreground">
          AI-written study help from the question's stored answer. It is educational, not a
          replacement for your course materials, institutional protocols or clinical judgement.
        </p>
      )}
    </div>
  );
}
