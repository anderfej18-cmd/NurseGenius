import { describe, expect, it } from "vitest";
import { ConflictError, LimitReachedError, NotFoundError, ValidationError } from "@/lib/app-errors";
import { mapDbError } from "./db-errors";

describe("mapDbError", () => {
  it.each([
    ["active_session_exists", ConflictError],
    ["invalid_question_set", ValidationError],
    ["session_limit_exceeded", LimitReachedError],
    ["daily_limit_reached", LimitReachedError],
    ["exam_not_found", NotFoundError],
    ["challenge_not_found", NotFoundError],
    ["user_not_found", NotFoundError],
    ["friendship_not_found", NotFoundError],
    ["cannot_befriend_self", ValidationError],
    ["already_friends", ConflictError],
    ["request_pending", ConflictError],
    ["friend_limit", LimitReachedError],
    ["request_limit", LimitReachedError],
    ["challenge_limit", LimitReachedError],
    ["challenge_closed", ConflictError],
    ["attempt_not_found", NotFoundError],
    ["attempt_closed", ConflictError],
    ["answers_not_in_test", ValidationError],
    ["test_not_found", NotFoundError],
    ["invalid_topic", ValidationError],
    ["payment reference already used", ConflictError],
    ["plan or amount does not match an active plan", ValidationError],
    ["invalid payment amount", ValidationError],
    ["invalid tier", ValidationError],
    ["profile not found", NotFoundError],
  ])("turns the named exception %s into a typed error", (message, expected) => {
    expect(mapDbError({ message: `ERROR: ${message}` })).toBeInstanceOf(expected);
  });

  it("tells the student how many answers a shared test needs, taking only the number from the message", () => {
    const mapped = mapDbError({ message: "ERROR: too_few_answered:12 (internal detail)" });
    expect(mapped).toBeInstanceOf(ValidationError);
    expect((mapped as Error).message).toBe("Answer at least 12 questions before submitting.");
  });

  it("treats a unique-violation as a conflict", () => {
    expect(mapDbError({ message: "duplicate key value", code: "23505" })).toBeInstanceOf(
      ConflictError,
    );
  });

  it("returns anything unrecognised unchanged, so it is logged and answered generically", () => {
    const unknown = { message: "relation does not exist", code: "42P01" };
    expect(mapDbError(unknown)).toBe(unknown);
  });

  it("never copies database text into the message a student sees", () => {
    const mapped = mapDbError({ message: "ERROR: exam_not_found (user 1234 secret detail)" });
    expect(mapped).toBeInstanceOf(NotFoundError);
    expect((mapped as Error).message).not.toMatch(/1234|secret|ERROR/);
  });
});
