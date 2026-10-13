import {
  ConflictError,
  ForbiddenError,
  LimitReachedError,
  NotFoundError,
  ValidationError,
} from "./errors";

interface DbError {
  message: string;
  code?: string;
}

const ACTIVE_SESSION = "You already have an exam in progress. Finish it before starting another.";

/** The exceptions our SQL functions raise by name, and what the student is told instead. */
const NAMED_EXCEPTIONS: ReadonlyArray<
  readonly [name: string, toError: (message: string) => Error]
> = [
  ["active_session_exists", () => new ConflictError(ACTIVE_SESSION)],
  [
    "invalid_question_set",
    () =>
      new ValidationError(
        "Some of the selected questions are no longer available. Please try again.",
      ),
  ],
  [
    "session_limit_exceeded",
    () => new LimitReachedError("That is more questions than your tier allows in one quiz."),
  ],
  [
    "daily_limit_reached",
    () => new LimitReachedError("Not enough questions left today on your tier."),
  ],
  ["exam_not_found", () => new NotFoundError("Exam not found.")],
  ["challenge_not_found", () => new NotFoundError("Challenge not found.")],
  ["user_not_found", () => new NotFoundError("No student has that username.")],
  ["friendship_not_found", () => new NotFoundError("Friend request not found.")],
  ["cannot_befriend_self", () => new ValidationError("You cannot add yourself as a friend.")],
  ["already_friends", () => new ConflictError("You are already friends.")],
  ["request_pending", () => new ConflictError("A friend request is already waiting.")],
  ["challenge_closed", () => new ConflictError("This challenge has closed.")],
  [
    "challenge_limit",
    () => new LimitReachedError("Too many challenges are waiting. Wait for answers first."),
  ],
  ["attempt_not_found", () => new NotFoundError("Attempt not found.")],
  ["attempt_closed", () => new ConflictError("This test has already been submitted.")],
  ["answers_not_in_test", () => new ValidationError("An answer does not belong to this test.")],
  ["test_not_found", () => new NotFoundError("This test could not be found.")],
  ["invalid_topic", () => new ValidationError("Enter a subcategory.")],
  ["test_not_started", () => new ConflictError("This test has not started yet.")],
  ["test_closed", () => new NotFoundError("This test link has expired or does not exist.")],
  ["test_empty", () => new ValidationError("This test has no questions.")],
  [
    "attempt_expired",
    () => new ConflictError("Your time is up. Your saved answers will be scored."),
  ],
  ["invalid_schedule", () => new ValidationError("Check the start time, end time and duration.")],
  [
    "allocation_exceeds_pool",
    (message) => {
      const found = /allocation_exceeds_pool:([^:]{1,200}):(\d{1,9})/.exec(message);
      return new ValidationError(
        found === null
          ? "A chosen subcategory has fewer eligible questions than you asked for."
          : `Only ${found[2]} eligible questions are available in “${found[1]}”.`,
      );
    },
  ],
  ["not_authorized", () => new ForbiddenError("You are not authorized to do this.")],
  ["question_not_found", () => new NotFoundError("Question not found.")],
  [
    "question_in_use",
    (message) => {
      const answers = /question_in_use:(\d{1,9})/.exec(message)?.[1] ?? "some";
      return new ConflictError(
        `${answers} student answers use this question, so it cannot be deleted. Retire it instead.`,
      );
    },
  ],
  [
    "too_few_answered",
    (message) => {
      const needed = /too_few_answered:(\d{1,4})/.exec(message)?.[1] ?? "most";
      return new ValidationError(`Answer at least ${needed} questions before submitting.`);
    },
  ],
  [
    "payment reference already used",
    () => new ConflictError("This payment reference has already been used."),
  ],
  [
    "plan or amount does not match",
    () => new ValidationError("The paid amount does not match the selected plan."),
  ],
  ["invalid payment", () => new ValidationError("The payment details are not valid.")],
  ["invalid tier", () => new ValidationError("The payment does not match a supported plan.")],
  ["profile not found", () => new NotFoundError("Profile not found.")],
  ["friend_limit", () => new LimitReachedError("The friend limit has been reached.")],
  [
    "request_limit",
    () => new LimitReachedError("Too many requests are waiting. Withdraw one or wait for answers."),
  ],
];

/**
 * Maps the named exceptions our SQL functions raise to typed errors. Anything unrecognised is
 * returned unchanged so the controller's guard logs it and answers with a generic message.
 */
export function mapDbError(error: DbError): unknown {
  if (error.code === "23505") return new ConflictError(ACTIVE_SESSION);
  const match = NAMED_EXCEPTIONS.find(([name]) => error.message.includes(name));
  return match === undefined ? error : match[1](error.message);
}
