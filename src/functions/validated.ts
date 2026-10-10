import type { z } from "zod";
import { ValidationError } from "@/lib/app-errors";

const MAX_ISSUES_SHOWN = 3;

/**
 * Wraps a zod schema as a server-function validator. A failure becomes a typed `ValidationError`
 * with a short field-level message instead of the raw ZodError, which the framework would send to
 * the browser together with its stack trace. The input type stays the schema's, so calls are typed.
 */
export function validated<S extends z.ZodTypeAny>(schema: S): (input: z.input<S>) => z.output<S> {
  return (input) => {
    const result = schema.safeParse(input);
    if (result.success) return result.data;
    const message = result.error.issues
      .slice(0, MAX_ISSUES_SHOWN)
      .map((issue) =>
        issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
      )
      .join("; ");
    throw new ValidationError(message || "Invalid request.");
  };
}
