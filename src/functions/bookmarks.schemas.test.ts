import { describe, expect, it } from "vitest";
import { addBookmarkSchema, listBookmarksSchema, removeBookmarkSchema } from "./bookmarks.schemas";

const uuid = "123e4567-e89b-42d3-a456-426614174000";

describe("bookmark schemas", () => {
  it("accepts valid input", () => {
    expect(addBookmarkSchema.safeParse({ questionId: uuid, note: "later" }).success).toBe(true);
    expect(removeBookmarkSchema.safeParse({ questionId: uuid }).success).toBe(true);
    expect(listBookmarksSchema.safeParse({ topic: "Anatomy", limit: 10, offset: 0 }).success).toBe(
      true,
    );
  });

  it.each([
    [addBookmarkSchema, { questionId: "x" }],
    [addBookmarkSchema, { questionId: uuid, note: "n".repeat(501) }],
    [addBookmarkSchema, { questionId: uuid, userId: uuid }],
    [removeBookmarkSchema, { questionId: uuid, userId: uuid }],
    [listBookmarksSchema, { limit: 100 }],
    [listBookmarksSchema, { userId: uuid }],
  ])("rejects %#", (schema, payload) => {
    expect(schema.safeParse(payload).success).toBe(false);
  });
});
