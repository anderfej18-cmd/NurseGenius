import { describe, expect, it } from "vitest";
import { type NotificationEvent, describeNotification } from "./notification";

describe("describeNotification", () => {
  it.each<[NotificationEvent, string]>([
    [
      { kind: "friend_request_received", payload: { friendshipId: "f1", fromUsername: "alice" } },
      "alice sent you a friend request.",
    ],
    [
      { kind: "friend_request_accepted", payload: { friendshipId: "f1", username: "bob" } },
      "bob accepted your friend request.",
    ],
    [
      {
        kind: "challenge_received",
        payload: { challengeId: "c1", fromUsername: "alice", totalQuestions: 10 },
      },
      "alice challenged you to 10 questions.",
    ],
    [
      {
        kind: "challenge_received",
        payload: { challengeId: "c1", fromUsername: "alice", totalQuestions: 1 },
      },
      "alice challenged you to 1 question.",
    ],
    [
      { kind: "challenge_declined", payload: { challengeId: "c1", username: "bob" } },
      "bob declined your challenge.",
    ],
  ])("words %j", (event, message) => {
    expect(describeNotification(event)).toBe(message);
  });

  it("puts a username into the message as plain text, however it looks", () => {
    const message = describeNotification({
      kind: "friend_request_received",
      payload: { friendshipId: "f1", fromUsername: "<b>x</b>" },
    });
    expect(message).toBe("<b>x</b> sent you a friend request.");
  });
});
