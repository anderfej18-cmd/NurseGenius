import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getSimilarQuestions } from "@/functions/intelligence.functions";
import { similarityReasonsText } from "@/lib/similar-view";

interface Props {
  questionId: string;
  examType: "RN" | "RM";
  topic: string;
}

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; result: Awaited<ReturnType<typeof getSimilarQuestions>> };

/**
 * Questions from the bank like one the student has answered, with why each was chosen. It loads when it
 * is opened, shows the wording only, and keeps answers hidden until the student has answered the
 * question in a test.
 */
export function SimilarQuestions({ questionId, examType, topic }: Props) {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    const ticket = ++latest.current;
    setState({ phase: "loading" });
    getSimilarQuestions({ data: { questionId, limit: 5 } }).then(
      (result) => {
        if (ticket === latest.current) setState({ phase: "ready", result });
      },
      (error: Error) => {
        if (ticket === latest.current) setState({ phase: "error", message: error.message });
      },
    );
  }, [questionId, attempt]);

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-sunken p-4">
      <p className="text-sm font-medium">Questions like this one</p>
      {state.phase === "loading" && (
        <div aria-busy="true" className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      )}
      {state.phase === "error" && (
        <Alert variant="destructive">
          <p>{state.message}</p>
          <div>
            <Button size="sm" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </Button>
          </div>
        </Alert>
      )}
      {state.phase === "ready" && state.result.items.length === 0 && (
        <p className="text-sm text-muted-foreground">No similar questions are available yet.</p>
      )}
      {state.phase === "ready" && state.result.items.length > 0 && (
        <>
          <ul className="flex flex-col gap-3">
            {state.result.items.map((item) => (
              <li key={item.id} className="flex flex-col gap-0.5 text-sm">
                <p>{item.question.question_text}</p>
                <p className="text-xs text-muted-foreground">
                  {similarityReasonsText(item.reasons)}
                  {item.attempted && " · You have answered this before"}
                </p>
              </li>
            ))}
          </ul>
          <div>
            <Button asChild size="sm">
              <Link to="/exam/start" search={{ similarTo: questionId, examType, topic }}>
                Practise these
              </Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
