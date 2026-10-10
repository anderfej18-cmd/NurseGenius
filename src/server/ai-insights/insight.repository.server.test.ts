import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "../testing/fake-supabase";
import { SupabaseInsightStore } from "./insight.repository.server";

const NARRATIVE = { summary: "s", points: [{ topic: "T", text: "t" }], nextAction: "n" };
const HASH = "c".repeat(64);

describe("SupabaseInsightStore", () => {
  it("finds one student's stored explanation of one kind, and no one else's", async () => {
    const fake = createFakeSupabase([
      {
        data: {
          facts_hash: HASH,
          narrative: NARRATIVE,
          generated_at: "2026-10-09T10:00:00+00:00",
        },
      },
    ]);
    const found = await new SupabaseInsightStore(fake.client).find("user-1", "readiness");
    expect(found).toEqual({
      factsHash: HASH,
      narrative: NARRATIVE,
      generatedAt: "2026-10-09T10:00:00.000Z",
    });
    expect(fake.callsOn("from:ai_insights", "eq").map((call) => call.args)).toEqual([
      ["user_id", "user-1"],
      ["kind", "readiness"],
    ]);
  });

  it("finds nothing when there is no row", async () => {
    const fake = createFakeSupabase([{ data: null }]);
    expect(await new SupabaseInsightStore(fake.client).find("u", "readiness")).toBeNull();
  });

  it("treats a stored narrative that no longer fits the schema as not stored, so it is written again", async () => {
    const fake = createFakeSupabase([
      {
        data: { facts_hash: HASH, narrative: { summary: 1 }, generated_at: "2026-10-09T10:00:00Z" },
      },
    ]);
    expect(await new SupabaseInsightStore(fake.client).find("u", "readiness")).toBeNull();
  });

  it("raises a database failure rather than hiding it", async () => {
    const fake = createFakeSupabase([{ error: { message: "boom" } }]);
    await expect(
      new SupabaseInsightStore(fake.client).find("u", "readiness"),
    ).rejects.toMatchObject({
      message: "boom",
    });
  });

  it("saves by replacing the student's row of that kind, with the owner taken from the call", async () => {
    const fake = createFakeSupabase([{ data: null }]);
    await new SupabaseInsightStore(fake.client).save("user-1", "recommendation", {
      factsHash: HASH,
      narrative: NARRATIVE,
      generatedAt: "2026-10-09T10:00:00.000Z",
      model: "m",
      promptVersion: "insight-1",
      promptTokens: 10,
      completionTokens: 5,
    });
    const [upsert] = fake.callsOn("from:ai_insights", "upsert");
    expect(upsert.args).toEqual([
      {
        user_id: "user-1",
        kind: "recommendation",
        facts_hash: HASH,
        narrative: NARRATIVE,
        model: "m",
        prompt_version: "insight-1",
        prompt_tokens: 10,
        completion_tokens: 5,
        generated_at: "2026-10-09T10:00:00.000Z",
      },
      { onConflict: "user_id,kind" },
    ]);
  });
});
