/** What happened, with the facts needed to tell the student; one variant per kind of notification. */
export type NotificationEvent =
  | {
      readonly kind: "friend_request_received";
      readonly payload: { readonly friendshipId: string; readonly fromUsername: string };
    }
  | {
      readonly kind: "friend_request_accepted";
      readonly payload: { readonly friendshipId: string; readonly username: string };
    }
  | {
      readonly kind: "challenge_received";
      readonly payload: {
        readonly challengeId: string;
        readonly fromUsername: string;
        readonly totalQuestions: number;
      };
    }
  | {
      readonly kind: "challenge_declined";
      readonly payload: { readonly challengeId: string; readonly username: string };
    };

export type NotificationKind = NotificationEvent["kind"];

/** A notification waiting to be delivered, as handed to a provider. */
export type OutboxNotification = NotificationEvent & {
  readonly id: string;
  readonly createdAt: Date;
};

/** The words for a notification. Usernames go in as plain text; whoever shows it must escape it. */
export function describeNotification(event: NotificationEvent): string {
  switch (event.kind) {
    case "friend_request_received":
      return `${event.payload.fromUsername} sent you a friend request.`;
    case "friend_request_accepted":
      return `${event.payload.username} accepted your friend request.`;
    case "challenge_received": {
      const { fromUsername, totalQuestions } = event.payload;
      const questions = totalQuestions === 1 ? "1 question" : `${totalQuestions} questions`;
      return `${fromUsername} challenged you to ${questions}.`;
    }
    case "challenge_declined":
      return `${event.payload.username} declined your challenge.`;
    default:
      return assertNever(event);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled notification: ${JSON.stringify(value)}`);
}
