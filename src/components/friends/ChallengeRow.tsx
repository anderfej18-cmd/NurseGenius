import { Link, useNavigate } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  declineFriendChallenge,
  startFriendChallenge,
  type listFriendChallenges,
} from "@/functions/competition.functions";

export type Challenge = Awaited<ReturnType<typeof listFriendChallenges>>["items"][number];

/** Runs one action at a time per control: `pending` names the control that is working. */
export type Act = (key: string, work: () => Promise<unknown>, success?: string) => Promise<boolean>;

const STATE_TEXT: Record<Challenge["state"]["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  waiting_for_opponent: "Waiting for your friend",
  declined: "Declined",
  expired: "Expired",
  completed: "Finished",
};

/** One challenge: who it is with, its state, the result once finished, and the actions that apply. */
export function ChallengeRow({
  challenge,
  act,
  pending,
}: {
  challenge: Challenge;
  act: Act;
  pending: string | null;
}) {
  const navigate = useNavigate();
  const state = challenge.state;
  const mine = challenge.role === "opponent";
  const canStart = state.status === "not_started" || state.status === "in_progress";

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-raised p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">
          {mine ? `From ${challenge.opponentUsername}` : `To ${challenge.opponentUsername}`}
          <span className="font-normal text-muted-foreground">
            {" "}
            · {challenge.examType} · {challenge.totalQuestions} questions
          </span>
        </span>
        <Badge variant={state.status === "completed" ? "success" : "secondary"}>
          {STATE_TEXT[state.status]}
        </Badge>
      </div>
      {state.status === "completed" && (
        <p className="text-sm">
          <span className="font-medium">
            {state.winner === "draw"
              ? "A draw. "
              : state.winner === "you"
                ? "You won. "
                : "They won. "}
          </span>
          You {state.you.correct} correct ({state.you.scorePct}%) · {challenge.opponentUsername}{" "}
          {state.opponent.correct} ({state.opponent.scorePct}%)
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {canStart && (
          <Button
            size="sm"
            loading={pending === `start-${challenge.id}`}
            onClick={() =>
              void act(`start-${challenge.id}`, async () => {
                const started = await startFriendChallenge({ data: { challengeId: challenge.id } });
                await navigate({ to: "/exam/$examId", params: { examId: started.examId } });
              })
            }
          >
            {state.status === "in_progress" ? "Continue" : "Start"}
          </Button>
        )}
        {mine && state.status === "not_started" && (
          <Button
            size="sm"
            variant="outline"
            loading={pending === `decline-${challenge.id}`}
            onClick={() =>
              void act(`decline-${challenge.id}`, () =>
                declineFriendChallenge({ data: { challengeId: challenge.id } }),
              )
            }
          >
            Decline
          </Button>
        )}
        {challenge.examId && state.status !== "in_progress" && state.status !== "not_started" && (
          <Button asChild size="sm" variant="outline">
            <Link to="/exam/$examId/results" params={{ examId: challenge.examId }}>
              View my result
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
