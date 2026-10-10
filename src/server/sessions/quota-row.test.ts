import { describe, expect, it } from "vitest";
import { QUOTA_COLUMNS, quotaFromRow } from "./quota-row";

describe("quotaFromRow", () => {
  it("maps the profile columns to a quota", () => {
    expect(
      quotaFromRow({
        tier: "erudite",
        expiry_date: "2027-01-01T00:00:00Z",
        questions_today: 12,
        last_question_date: "2026-10-10",
      }),
    ).toEqual({
      tier: "erudite",
      expiryDate: "2027-01-01T00:00:00Z",
      questionsToday: 12,
      lastQuestionDate: "2026-10-10",
    });
  });

  it("keeps a missing expiry and a missing date as null", () => {
    expect(
      quotaFromRow({
        tier: "novice",
        expiry_date: null,
        questions_today: 0,
        last_question_date: null,
      }),
    ).toEqual({ tier: "novice", expiryDate: null, questionsToday: 0, lastQuestionDate: null });
  });

  it.each([
    [{ tier: "platinum", expiry_date: null, questions_today: 0, last_question_date: null }],
    [{ tier: "novice", expiry_date: null, questions_today: -1, last_question_date: null }],
    [{ tier: "novice", expiry_date: null, questions_today: "3", last_question_date: null }],
    [{ tier: "novice" }],
  ])("fails loudly on a row the database should never produce: %j", (row) => {
    expect(() => quotaFromRow(row)).toThrow();
  });

  it("names exactly the columns the mapping reads", () => {
    expect(QUOTA_COLUMNS).toBe("tier, expiry_date, questions_today, last_question_date");
  });
});
