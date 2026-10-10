import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getSimilarQuestions } from "@/functions/intelligence.functions";
import { similarityReasonsText } from "@/lib/similar-view";

interface Props {
  questionId: string;
  examType: "RN" | "RM";
  topic: string;
}

/**
 * Questions from the bank like one the student has answered, with why each was chosen. It shows the
 * wording only; answers stay hidden until the student has answered the question in a test.
 */
export function SimilarQuestions({ questionId, examType, topic }: Props) {
  const [state, setState] = useState<
    | { phase: "idle" }
    | { phase: "loading" }
    | { phase: "error"; message: string }
    | { phase: "ready"; result: Awaited<ReturnType<typeof getSimilarQuestions>> }
  >({ phase: "idle" });

  const find = async () => {
    setState({ phase: "loading" });
    try {
      setState({
        phase: "ready",
        result: await getSimilarQuestions({ data: { questionId, limit: 5 } }),
      });
    } catch (error) {
      setState({ phase: "error", message: (error as Error).message });
    }
  };

  return (
    <div className="space-y-2">
      {state.phase !== "ready" && (
        <Button
          size="sm"
          variant="outline"
          disabled={state.phase === "loading"}
          onClick={() => void find()}
        >
          {state.phase === "loading" ? "Finding…" : "Find similar questions"}
        </Button>
      )}
      {state.phase === "error" && (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      )}
      {state.phase === "ready" && state.result.items.length === 0 && (
        <p className="text-sm text-muted-foreground">No similar questions are available yet.</p>
      )}
      {state.phase === "ready" && state.result.items.length > 0 && (
        <div className="rounded-lg border p-3 space-y-3">
          <p className="text-sm font-medium">Questions like this one</p>
          <ul className="space-y-2">
            {state.result.items.map((item) => (
              <li key={item.id} className="text-sm space-y-0.5">
                <p>{item.question.question_text}</p>
                <p className="text-xs text-muted-foreground">
                  {similarityReasonsText(item.reasons)}
                  {item.attempted && " · You have answered this before"}
                </p>
              </li>
            ))}
          </ul>
          <Button asChild size="sm">
            <Link to="/exam/start" search={{ similarTo: questionId, examType, topic }}>
              Practise these
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
