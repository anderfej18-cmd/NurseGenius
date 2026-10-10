import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ValidationError } from "@/lib/app-errors";
import { validated } from "./validated";

const schema = z.object({ count: z.number().int().min(1), name: z.string().min(1) }).strict();

describe("validated", () => {
  it("returns parsed data", () => {
    expect(validated(schema)({ count: 2, name: "x" })).toEqual({ count: 2, name: "x" });
  });

  it("throws a typed ValidationError with field-level messages and no stack", () => {
    let thrown: unknown;
    try {
      validated(schema)({ count: 0, name: "", extra: true } as never);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ValidationError);
    const error = thrown as ValidationError;
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toMatch(/count/);
    expect(error.stack).toBe("");
    expect(error.message).not.toMatch(/ZodError|\.ts|node_modules/);
  });

  it("limits how many issues are echoed back", () => {
    const wide = z.object({
      a: z.string(),
      b: z.string(),
      c: z.string(),
      d: z.string(),
      e: z.string(),
    });
    expect(() => validated(wide)({} as never)).toThrow(/^(?:[^;]*;){2}[^;]*$/);
  });
});
