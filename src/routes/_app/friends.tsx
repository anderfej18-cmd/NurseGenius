import { createFileRoute } from "@tanstack/react-router";
import { Swords, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { LoadFailed } from "@/components/app/LoadFailed";
import { Section } from "@/components/app/Section";
import { ChallengeRow, type Act } from "@/components/friends/ChallengeRow";
import { PersonRow } from "@/components/friends/PersonRow";
import { SignedInPage } from "@/components/SignedInPage";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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

export const Route = createFileRoute("/_app/friends")({
  component: Friends,
  head: () => ({
    meta: [
      { title: "Friends and Challenges | NurseGenius" },
      { name: "description", content: "Add friends and challenge them to a set of questions." },
    ],
  }),
});

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
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
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
  const act: Act = async (key, work, success) => {
    setPending(key);
    try {
      await work();
      if (success) toast.success(success);
      await reloadAll();
      setPending(null);
      return true;
    } catch (error) {
      toast.error((error as Error).message);
      setPending(null);
      return false;
    }
  };

  const sendRequest = async () => {
    const name = username.trim();
    if (name === "") {
      setUsernameError("Enter your friend's username.");
      return;
    }
    setUsernameError(null);
    setPending("request");
    try {
      const result = await requestFriend({ data: { username: name } });
      setUsername("");
      toast.info(result.status === "accepted" ? "You are now friends." : "Request sent.");
      await reloadAll();
    } catch (error) {
      setUsernameError((error as Error).message);
    }
    setPending(null);
  };

  const incomingItems = incoming.data?.items ?? [];
  const outgoingItems = outgoing.data?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Section title="Add a friend" description="Ask by username. They get a request to accept.">
        <form
          noValidate
          className="flex max-w-md flex-col items-start gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void sendRequest();
          }}
        >
          <Field label="Friend's username" error={usernameError} className="w-full">
            {(control) => (
              <Input
                {...control}
                value={username}
                maxLength={50}
                autoComplete="off"
                onChange={(event) => setUsername(event.target.value)}
              />
            )}
          </Field>
          <Button type="submit" loading={pending === "request"}>
            <UserPlus />
            Send request
          </Button>
        </form>
      </Section>

      {incomingItems.length > 0 && (
        <Section title="Requests for you">
          <ul className="divide-y divide-divider">
            {incomingItems.map((request) => (
              <PersonRow key={request.friendshipId} name={request.username}>
                <Button
                  size="sm"
                  loading={pending === `accept-${request.friendshipId}`}
                  onClick={() =>
                    void act(
                      `accept-${request.friendshipId}`,
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
                  loading={pending === `decline-${request.friendshipId}`}
                  onClick={() =>
                    void act(`decline-${request.friendshipId}`, () =>
                      respondToFriendRequest({
                        data: { friendshipId: request.friendshipId, accept: false },
                      }),
                    )
                  }
                >
                  Decline
                </Button>
              </PersonRow>
            ))}
          </ul>
        </Section>
      )}

      {outgoingItems.length > 0 && (
        <Section title="Waiting for an answer">
          <ul className="divide-y divide-divider">
            {outgoingItems.map((request) => (
              <PersonRow key={request.friendshipId} name={request.username}>
                <Button
                  size="sm"
                  variant="outline"
                  loading={pending === `withdraw-${request.friendshipId}`}
                  onClick={() =>
                    void act(`withdraw-${request.friendshipId}`, () =>
                      removeFriend({ data: { friendshipId: request.friendshipId } }),
                    )
                  }
                >
                  Withdraw
                </Button>
              </PersonRow>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Your friends">
        {friends.error && !friends.data && <LoadFailed load={friends} label="Your friends" />}
        {friends.loading && !friends.data && !friends.error && <Skeleton className="h-16 w-full" />}
        {friends.data && friends.data.items.length === 0 && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users aria-hidden="true" className="size-4" />
            No friends yet. Add one above to challenge them.
          </p>
        )}
        {friends.data && friends.data.items.length > 0 && (
          <ul className="divide-y divide-divider">
            {friends.data.items.map((friend) => (
              <PersonRow key={friend.friendshipId} name={friend.username}>
                <Button
                  size="sm"
                  loading={pending === `challenge-${friend.friendshipId}`}
                  onClick={() =>
                    void act(
                      `challenge-${friend.friendshipId}`,
                      () => createFriendChallenge({ data: { friendshipId: friend.friendshipId } }),
                      "Challenge sent.",
                    )
                  }
                >
                  <Swords />
                  Challenge
                </Button>
                <ConfirmDialog
                  title={`Remove ${friend.username}?`}
                  description="You will no longer be friends. You can send a new request later."
                  confirmLabel="Remove friend"
                  destructive
                  onConfirm={() =>
                    act(`remove-${friend.friendshipId}`, () =>
                      removeFriend({ data: { friendshipId: friend.friendshipId } }),
                    )
                  }
                  trigger={(open) => (
                    <Button size="sm" variant="outline" onClick={open}>
                      Remove
                    </Button>
                  )}
                />
              </PersonRow>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Challenges"
        description="Both of you answer the same questions. The server scores them."
      >
        {challenges.error && !challenges.data && (
          <LoadFailed load={challenges} label="Your challenges" />
        )}
        {challenges.loading && !challenges.data && !challenges.error && (
          <Skeleton className="h-24 w-full" />
        )}
        {challenges.data && challenges.data.items.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No challenges yet. Challenge a friend from the list above.
          </p>
        )}
        {challenges.data && challenges.data.items.length > 0 && (
          <ul className="flex flex-col gap-3">
            {challenges.data.items.map((challenge) => (
              <li key={challenge.id}>
                <ChallengeRow challenge={challenge} act={act} pending={pending} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
