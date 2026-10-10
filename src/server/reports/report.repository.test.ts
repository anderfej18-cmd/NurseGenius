import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "../testing/fake-supabase";
import { SupabaseReportRepository } from "./report.repository.server";

const chain = (fake: ReturnType<typeof createFakeSupabase>, index = 0) =>
  fake.recorded[index].chain.map((c) => [c.method, ...c.args]);

describe("SupabaseReportRepository", () => {
  it("reports a repeat of an open report as a duplicate", async () => {
    const fake = createFakeSupabase([{ error: { message: "duplicate key", code: "23505" } }]);
    await expect(
      new SupabaseReportRepository(fake.client).create("u1", {
        questionId: "q1",
        reason: "typo",
        details: null,
      }),
    ).resolves.toBe("duplicate");
  });

  it("rethrows other database errors", async () => {
    const error = { message: "boom" };
    const fake = createFakeSupabase([{ error }]);
    await expect(
      new SupabaseReportRepository(fake.client).create("u1", {
        questionId: "q1",
        reason: "typo",
        details: null,
      }),
    ).rejects.toBe(error);
  });

  it("inserts the reporter from the argument, never from the payload", async () => {
    const fake = createFakeSupabase([{ error: null }]);
    await new SupabaseReportRepository(fake.client).create("u1", {
      questionId: "q1",
      reason: "typo",
      details: "d",
    });
    expect(chain(fake)).toEqual([
      ["insert", { question_id: "q1", reporter_id: "u1", reason: "typo", details: "d" }],
    ]);
  });

  it("lists only the student's reports and never selects the answer key", async () => {
    const fake = createFakeSupabase([{ data: [] }]);
    await new SupabaseReportRepository(fake.client).listMine("u1", { limit: 21, offset: 0 });
    expect(chain(fake)).toEqual(expect.arrayContaining([["eq", "reporter_id", "u1"]]));
    expect(String(fake.callsOn("from:question_reports", "select")[0].args[0])).not.toMatch(
      /correct_answer|rationale|\*/,
    );
  });

  it("resolves only an open report, in a single guarded update", async () => {
    const fake = createFakeSupabase([{ data: [{ id: "r1" }] }]);
    await expect(
      new SupabaseReportRepository(fake.client).resolve({
        reportId: "r1",
        adminId: "a1",
        status: "resolved",
        note: null,
        at: "2026-10-06T00:00:00Z",
      }),
    ).resolves.toBe("resolved");
    expect(chain(fake)).toEqual(
      expect.arrayContaining([
        [
          "update",
          {
            status: "resolved",
            resolution_note: null,
            resolved_by: "a1",
            resolved_at: "2026-10-06T00:00:00Z",
          },
        ],
        ["eq", "id", "r1"],
        ["eq", "status", "open"],
      ]),
    );
  });

  it("tells a handled report from a missing one", async () => {
    const handled = createFakeSupabase([{ data: [] }, { data: { id: "r1" } }]);
    const missing = createFakeSupabase([{ data: [] }, { data: null }]);
    const args = {
      reportId: "r1",
      adminId: "a1",
      status: "dismissed" as const,
      note: null,
      at: "2026-10-06T00:00:00Z",
    };
    await expect(new SupabaseReportRepository(handled.client).resolve(args)).resolves.toBe(
      "not_open",
    );
    await expect(new SupabaseReportRepository(missing.client).resolve(args)).resolves.toBe(
      "not_found",
    );
  });
});
