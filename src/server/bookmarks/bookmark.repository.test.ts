import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "../testing/fake-supabase";
import { SupabaseBookmarkRepository } from "./bookmark.repository.server";

const USER = "user-1";
const chain = (fake: ReturnType<typeof createFakeSupabase>, index = 0) =>
  fake.recorded[index].chain.map((c) => [c.method, ...c.args]);

describe("SupabaseBookmarkRepository", () => {
  it("only matches active questions when checking a bookmark target", async () => {
    const fake = createFakeSupabase([{ data: { id: "q1" } }]);
    await expect(new SupabaseBookmarkRepository(fake.client).questionIsActive("q1")).resolves.toBe(
      true,
    );
    expect(chain(fake)).toEqual(
      expect.arrayContaining([
        ["eq", "id", "q1"],
        ["eq", "status", "active"],
      ]),
    );
  });

  it("scopes has, count, upsert, remove and list to the student", async () => {
    const fake = createFakeSupabase([
      { data: null },
      { data: null },
      { data: [{ id: "b" }] },
      { data: [] },
    ]);
    const repository = new SupabaseBookmarkRepository(fake.client);
    await expect(repository.has(USER, "q1")).resolves.toBe(false);
    await repository.upsert(USER, "q1", "note");
    await expect(repository.remove(USER, "q1")).resolves.toBe(true);
    await repository.list(USER, { limit: 21, offset: 0 });

    expect(chain(fake, 0)).toEqual(
      expect.arrayContaining([
        ["eq", "user_id", USER],
        ["eq", "question_id", "q1"],
      ]),
    );
    expect(chain(fake, 1)).toEqual([
      [
        "upsert",
        { user_id: USER, question_id: "q1", note: "note" },
        { onConflict: "user_id,question_id" },
      ],
    ]);
    expect(chain(fake, 2)).toEqual(
      expect.arrayContaining([
        ["eq", "user_id", USER],
        ["eq", "question_id", "q1"],
      ]),
    );
    expect(chain(fake, 3)).toEqual(
      expect.arrayContaining([
        ["eq", "user_id", USER],
        ["range", 0, 20],
      ]),
    );
  });

  it("selects no answer key when listing", async () => {
    const fake = createFakeSupabase([{ data: [] }]);
    await new SupabaseBookmarkRepository(fake.client).list(USER, {
      limit: 21,
      offset: 0,
      topic: "Anatomy",
      examType: "RN",
    });
    const select = String(fake.callsOn("from:bookmarks", "select")[0].args[0]);
    expect(select).not.toMatch(/correct_answer|rationale|\*/);
    expect(chain(fake)).toEqual(
      expect.arrayContaining([
        ["eq", "questions.topic", "Anatomy"],
        ["eq", "questions.exam_type", "RN"],
      ]),
    );
  });
});
