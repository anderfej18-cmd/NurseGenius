// Server-side error handling. The error classes themselves are shared (`@/lib/app-errors`) so the
// client-safe validation wrapper in src/functions can throw the same typed errors.
import { AppError } from "@/lib/app-errors";

export * from "@/lib/app-errors";

const GENERIC_MESSAGE = "Something went wrong. Please try again.";

/**
 * Returns the AppError unchanged, or logs the unexpected error server-side and returns a
 * generic one. Database and stack details never reach the client.
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  console.error(error);
  return new AppError(GENERIC_MESSAGE, "INTERNAL", 500);
}

/** Runs a server operation and maps any failure to a safe AppError. Used at the controller boundary. */
export async function guard<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw toAppError(error);
  }
}

/**
 * Runs follow-up work whose failure must not fail the request that triggered it (for example
 * refreshing a derived cache after a result was already committed). The failure is logged, never lost.
 */
export async function bestEffort(operation: () => Promise<unknown>, what: string): Promise<void> {
  try {
    await operation();
  } catch (error) {
    console.error(`[best-effort] ${what} failed`, error);
  }
}
