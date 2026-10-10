import { describe, expect, it } from "vitest";
import { emptySchema } from "./common.schemas";

describe("emptySchema", () => {
  it("accepts only an empty object", () => {
    expect(emptySchema.safeParse({}).success).toBe(true);
    expect(emptySchema.safeParse({ userId: "someone-else" }).success).toBe(false);
  });
});
