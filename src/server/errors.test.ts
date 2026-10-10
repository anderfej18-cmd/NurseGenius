import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  LimitReachedError,
  NotFoundError,
  SessionClosedError,
  UnauthorizedError,
  ValidationError,
  bestEffort,
  toAppError,
} from "./errors";

describe("typed errors", () => {
  it.each([
    [new ValidationError("bad"), "VALIDATION_ERROR", 400],
    [new UnauthorizedError(), "UNAUTHORIZED", 401],
    [new ForbiddenError(), "FORBIDDEN", 403],
    [new NotFoundError(), "NOT_FOUND", 404],
    [new ConflictError("dup"), "CONFLICT", 409],
    [new LimitReachedError("cap"), "LIMIT_REACHED", 429],
    [new SessionClosedError(), "SESSION_CLOSED", 409],
  ])("%s carries its code and status", (error, code, status) => {
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe(code);
    expect(error.statusCode).toBe(status);
  });

  it("keeps the subclass name for logging", () => {
    expect(new NotFoundError().name).toBe("NotFoundError");
  });
});

describe("toAppError", () => {
  afterEach(() => vi.restoreAllMocks());

  it("passes AppErrors through untouched", () => {
    const error = new ForbiddenError("nope");
    expect(toAppError(error)).toBe(error);
  });

  it("hides internal details of unexpected errors", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const mapped = toAppError(new Error('relation "exams" violates constraint xyz'));
    expect(mapped.code).toBe("INTERNAL");
    expect(mapped.statusCode).toBe(500);
    expect(mapped.message).not.toContain("exams");
    expect(log).toHaveBeenCalledOnce();
  });

  it("handles non-Error throwables", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(toAppError("boom").code).toBe("INTERNAL");
  });
});

describe("error transport", () => {
  it("carries no stack trace, because the framework serialises thrown errors to the browser", () => {
    for (const error of [
      new NotFoundError("x"),
      new ValidationError("y"),
      toAppErrorQuietly(new Error("db exploded")),
    ]) {
      expect(error.stack ?? "").toBe("");
      expect(Object.getOwnPropertyNames(error)).not.toContain("cause");
    }
  });
});

function toAppErrorQuietly(error: unknown) {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const mapped = toAppError(error);
  log.mockRestore();
  return mapped;
}

describe("bestEffort", () => {
  afterEach(() => vi.restoreAllMocks());

  it("runs the operation", async () => {
    const operation = vi.fn().mockResolvedValue("done");
    await bestEffort(operation, "task");
    expect(operation).toHaveBeenCalledOnce();
  });

  it("logs a failure with what was being attempted and does not rethrow it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      bestEffort(() => Promise.reject(new Error("db down")), "refresh reviews"),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledOnce();
    expect(String(log.mock.calls[0][0])).toContain("refresh reviews");
  });
});
