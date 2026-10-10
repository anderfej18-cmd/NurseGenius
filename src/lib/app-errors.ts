// Typed, operational errors thrown by services and mapped to safe messages at the
// server-function boundary. Anything that is not an AppError is treated as unexpected
// and never has its message sent to the client. In the browser a failed call throws an Error
// with `message`, `code` and `statusCode` (the HTTP status of the transport itself is 500).

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "LIMIT_REACHED"
  | "SESSION_CLOSED"
  | "PAYMENT_FAILED"
  | "INTERNAL";

export class AppError extends Error {
  constructor(
    message: string,
    readonly code: ErrorCode,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = new.target.name;
    // TanStack Start serialises thrown errors to the browser, stack included. These errors are
    // returned to clients on purpose, so they must carry nothing but code, status and message.
    this.stack = "";
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 400);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Sign in to continue.") {
    super(message, "UNAUTHORIZED", 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to this resource.") {
    super(message, "FORBIDDEN", 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found.") {
    super(message, "NOT_FOUND", 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, "CONFLICT", 409);
  }
}

/** Daily or per-session quota reached (tier limits). */
export class LimitReachedError extends AppError {
  constructor(message: string) {
    super(message, "LIMIT_REACHED", 429);
  }
}

/** The session is completed or past its deadline, so it no longer accepts changes. */
export class SessionClosedError extends AppError {
  constructor(message = "This session is closed.") {
    super(message, "SESSION_CLOSED", 409);
  }
}

/** A payment could not be confirmed with the provider. */
export class PaymentError extends AppError {
  constructor(message: string) {
    super(message, "PAYMENT_FAILED", 402);
  }
}
