import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "../../testing/fake-supabase";
import { SupabaseStudyDaysStore } from "./streak.repository.server";

const USER = "user-1";

describe("SupabaseStudyDaysStore.listStudyDays", () => {
  it("asks for the signed-in student's days from the given date and maps the rows", async () => {
    const fake = createFakeSupabase([
      {
        data: [
          { study_day: "2026-10-09", answered: 7 },
          { study_day: "2026-10-10", answered: 5 },
        ],
      },
    ]);
    const days = await new SupabaseStudyDaysStore(fake.client).listStudyDays(USER, "2025-10-10");

    expect(fake.callsOn("rpc:get_study_days", "args")[0].args[0]).toEqual({
      _user_id: USER,
      _since: "2025-10-10",
    });
    expect(days).toEqual([
      { day: "2026-10-09", answered: 7 },
      { day: "2026-10-10", answered: 5 },
    ]);
  });

  it("returns no days for a student with no history", async () => {
    const fake = createFakeSupabase([{ data: [] }]);
    expect(await new SupabaseStudyDaysStore(fake.client).listStudyDays(USER, "2025-10-10")).toEqual(
      [],
    );
  });

  it("rethrows database errors", async () => {
    const error = { message: "boom" };
    const fake = createFakeSupabase([{ error }]);
    await expect(
      new SupabaseStudyDaysStore(fake.client).listStudyDays(USER, "2025-10-10"),
    ).rejects.toBe(error);
  });

  it("fails loudly on a row the database should never produce", async () => {
    const fake = createFakeSupabase([{ data: [{ study_day: "yesterday", answered: -1 }] }]);
    await expect(
      new SupabaseStudyDaysStore(fake.client).listStudyDays(USER, "2025-10-10"),
    ).rejects.toThrow();
  });
});
