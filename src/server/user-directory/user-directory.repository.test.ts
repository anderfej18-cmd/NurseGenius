import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "../testing/fake-supabase";
import { SupabaseUserDirectoryStore } from "./user-directory.repository.server";

describe("SupabaseUserDirectoryStore", () => {
  it("lists a page through its function and parses username and tier only", async () => {
    const fake = createFakeSupabase([
      {
        data: [
          { username: "alice", tier: "scholar", email: "leak@example.com" },
          { username: null, tier: "novice" },
        ],
      },
    ]);
    const users = await new SupabaseUserDirectoryStore(fake.client).list({ limit: 21, offset: 40 });
    expect(fake.callsOn("rpc:list_user_directory", "args")[0].args[0]).toEqual({
      _limit: 21,
      _offset: 40,
    });
    expect(users).toEqual([
      { username: "alice", tier: "scholar" },
      { username: null, tier: "novice" },
    ]);
  });

  it("rejects a tier the application does not know", async () => {
    const fake = createFakeSupabase([{ data: [{ username: "a", tier: "platinum" }] }]);
    await expect(
      new SupabaseUserDirectoryStore(fake.client).list({ limit: 1, offset: 0 }),
    ).rejects.toThrow();
  });

  it("counts per tier", async () => {
    const fake = createFakeSupabase([{ data: [{ tier: "novice", total: 5 }] }]);
    expect(await new SupabaseUserDirectoryStore(fake.client).countByTier()).toEqual([
      { tier: "novice", total: 5 },
    ]);
    expect(fake.recorded[0].target).toBe("rpc:count_users_by_tier");
  });

  it("surfaces a database error", async () => {
    const fake = createFakeSupabase([{ error: { message: "boom" } }]);
    await expect(new SupabaseUserDirectoryStore(fake.client).countByTier()).rejects.toMatchObject({
      message: "boom",
    });
  });
});
