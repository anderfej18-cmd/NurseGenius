import { describe, expect, it } from "vitest";
import {
  adminListReportsSchema,
  createReportSchema,
  listMyReportsSchema,
  resolveReportSchema,
} from "./reports.schemas";

const uuid = "123e4567-e89b-42d3-a456-426614174000";

describe("report schemas", () => {
  it("accepts valid input", () => {
    expect(
      createReportSchema.safeParse({
        questionId: uuid,
        reason: "incorrect_answer",
        details: "Key looks wrong",
      }).success,
    ).toBe(true);
    expect(listMyReportsSchema.safeParse({ limit: 10 }).success).toBe(true);
    expect(adminListReportsSchema.safeParse({ status: "open", offset: 20 }).success).toBe(true);
    expect(
      resolveReportSchema.safeParse({ reportId: uuid, status: "dismissed", note: "Not an issue" })
        .success,
    ).toBe(true);
  });

  it.each([
    [createReportSchema, { questionId: uuid, reason: "rude" }],
    [createReportSchema, { questionId: "x", reason: "typo" }],
    [createReportSchema, { questionId: uuid, reason: "typo", details: "d".repeat(1001) }],
    [createReportSchema, { questionId: uuid, reason: "typo", status: "resolved" }],
    [createReportSchema, { questionId: uuid, reason: "typo", reporterId: uuid }],
    [resolveReportSchema, { reportId: uuid, status: "open" }],
    [resolveReportSchema, { reportId: uuid, status: "resolved", resolvedBy: uuid }],
    [adminListReportsSchema, { status: "deleted" }],
    [listMyReportsSchema, { limit: 51 }],
  ])("rejects %#", (schema, payload) => {
    expect(schema.safeParse(payload).success).toBe(false);
  });
});
