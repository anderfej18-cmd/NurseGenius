import { describe, expect, it } from "vitest";
import { listMistakesSchema } from "./mistakes.schemas";

describe("listMistakesSchema", () => {
  it("defaults to the all view", () => {
    expect(listMistakesSchema.parse({}).view).toBe("all");
  });

  it("accepts each view with filters and paging", () => {
    for (const view of ["all", "most_repeated", "recent", "repeatedly_failed"]) {
      expect(
        listMistakesSchema.safeParse({
          view,
          topic: "Anatomy",
          examType: "RN",
          limit: 10,
          offset: 20,
        }).success,
      ).toBe(true);
    }
  });

  it.each([
    [{ view: "everything" }],
    [{ limit: 51 }],
    [{ offset: -1 }],
    [{ offset: 10_001 }],
    [{ topic: "" }],
    [{ userId: "someone-else" }],
  ])("rejects %j", (payload) => {
    expect(listMistakesSchema.safeParse(payload).success).toBe(false);
  });
});
