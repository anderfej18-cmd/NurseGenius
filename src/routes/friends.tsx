import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { SignedInPage } from "@/components/SignedInPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createFriendChallenge,
  declineFriendChallenge,
  listFriendChallenges,
  listFriends,
  removeFriend,
  requestFriend,
  respondToFriendRequest,
  startFriendChallenge,
} from "@/functions/competition.functions";
import { useServerData } from "@/hooks/use-server-data";

export const Route = createFileRoute("/friends")({
  component: Friends,
  head: () => ({
    meta: [
      { title: "Friends and Challenges — NurseGenius" },
      { name: "description", content: "Add friends and challenge them to a set of questions." },
    ],
  }),
});

type Challenge = Awaited<ReturnType<typeof listFriendChallenges>>["items"][number];

const STATE_TEXT: Record<Challenge["state"]["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  waiting_for_opponent: "Waiting for your friend",
  declined: "Declined",
  expired: "Expired",
  completed: "Finished",
};

function Friends() {
  return (
    <SignedInPage
      title="Friends and Challenges"
      description="Add a friend by username, then challenge them to the same set of questions."
    >
      {() => <FriendsContent />}
    </SignedInPage>
  );
}

function FriendsContent() {
  const [username, setUsername] = useState("");
  const friends = useServerData(() => listFriends({ data: { kind: "friends", limit: 50 } }), []);
  const incoming = useServerData(() => listFriends({ data: { kind: "incoming", limit: 50 } }), []);
  const outgoing = useServerData(() => listFriends({ data: { kind: "outgoing", limit: 50 } }), []);
  const challenges = useServerData(() => listFriendChallenges({ data: { limit: 20 } }), []);

  const reloadAll = async () => {
    await Promise.all([
      friends.reload(),
      incoming.reload(),
      outgoing.reload(),
      challenges.reload(),
    ]);
  };
  const act = async (work: () => Promise<unknown>, success?: string) => {
    try {
      await work();
      if (success) toast.success(success);
      await reloadAll();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <>
      <Card className="p-5 space-y-3">
        <h2 className="font-semibold">Add a friend</h2>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void act(async () => {
              const result = await requestFriend({ data: { username } });
              setUsername("");
              toast.info(result.status === "accepted" ? "You are now friends." : "Request sent.");
            });
          }}
        >
          <Input
            value={username}
            maxLength={50}
            placeholder="Their username"
            aria-label="Friend's username"
            onChange={(event) => setUsername(event.target.value)}
          />
          <Button type="submit" disabled={username.trim() === ""}>
            Send request
          </Button>
        </form>
      </Card>

      {(incoming.data?.items.length ?? 0) > 0 && (
        <Card className="p-5 space-y-3">
          <h2 className="font-semibold">Requests for you</h2>
          {incoming.data?.items.map((request) => (
            <div key={request.friendshipId} className="flex items-center justify-between gap-2">
              <span className="font-medium">{request.username}</span>
              <span className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    void act(
                      () =>
                        respondToFriendRequest({
                          data: { friendshipId: request.friendshipId, accept: true },
                        }),
                      "Friend added.",
                    )
                  }
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void act(() =>
                      respondToFriendRequest({
                        data: { friendshipId: request.friendshipId, accept: false },
                      }),
                    )
                  }
                >
                  Decline
                </Button>
              </span>
            </div>
          ))}
        </Card>
      )}

      {(outgoing.data?.items.length ?? 0) > 0 && (
        <Card className="p-5 space-y-3">
          <h2 className="font-semibold">Waiting for an answer</h2>
          {outgoing.data?.items.map((request) => (
            <div key={request.friendshipId} className="flex items-center justify-between gap-2">
              <span>{request.username}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void act(() => removeFriend({ data: { friendshipId: request.friendshipId } }))
                }
              >
                Withdraw
              </Button>
            </div>
          ))}
        </Card>
      )}

      <Card className="p-5 space-y-3">
        <h2 className="font-semibold">Your friends</h2>
        {friends.error && <p className="text-destructive text-sm">{friends.error}</p>}
        {!friends.loading && (friends.data?.items.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">No friends yet.</p>
        )}
        {friends.data?.items.map((friend) => (
          <div key={friend.friendshipId} className="flex items-center justify-between gap-2">
            <span className="font-medium">{friend.username}</span>
            <span className="flex gap-2">
              <Button
                size="sm"
                onClick={() =>
                  void act(
                    () => createFriendChallenge({ data: { friendshipId: friend.friendshipId } }),
                    "Challenge sent.",
                  )
                }
              >
                Challenge
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (confirm(`Remove ${friend.username} from your friends?`)) {
                    void act(() => removeFriend({ data: { friendshipId: friend.friendshipId } }));
                  }
                }}
              >
                Remove
              </Button>
            </span>
          </div>
        ))}
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="font-semibold">Challenges</h2>
        {challenges.error && <p className="text-destructive text-sm">{challenges.error}</p>}
        {!challenges.loading && (challenges.data?.items.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">No challenges yet.</p>
        )}
        {challenges.data?.items.map((challenge) => (
          <ChallengeRow key={challenge.id} challenge={challenge} act={act} />
        ))}
      </Card>
    </>
  );
}

function ChallengeRow({
  challenge,
  act,
}: {
  challenge: Challenge;
  act: (work: () => Promise<unknown>, success?: string) => Promise<void>;
}) {
  const navigate = useNavigate();
  const state = challenge.state;
  const mine = challenge.role === "opponent";
  const canStart = state.status === "not_started" || state.status === "in_progress";

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">
          {mine ? `From ${challenge.opponentUsername}` : `To ${challenge.opponentUsername}`}
          <span className="text-muted-foreground font-normal">
            {" "}
            · {challenge.examType} · {challenge.totalQuestions} questions
          </span>
        </span>
        <Badge variant="secondary">{STATE_TEXT[state.status]}</Badge>
      </div>
      {state.status === "completed" && (
        <p className="text-sm">
          {state.winner === "draw"
            ? "A draw. "
            : state.winner === "you"
              ? "You won. "
              : "They won. "}
          You {state.you.correct} correct ({state.you.scorePct}%) · {challenge.opponentUsername}{" "}
          {state.opponent.correct} ({state.opponent.scorePct}%)
        </p>
      )}
      <div className="flex gap-2">
        {canStart && (
          <Button
            size="sm"
            onClick={() =>
              void act(async () => {
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
            onClick={() =>
              void act(() => declineFriendChallenge({ data: { challengeId: challenge.id } }))
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
