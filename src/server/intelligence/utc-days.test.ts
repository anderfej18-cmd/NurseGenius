import { describe, expect, it } from "vitest";
import { daysBetweenUtc, daysUntilDate, utcDate } from "./utc-days";

describe("daysBetweenUtc", () => {
  it("counts whole UTC calendar days, whatever the time of day", () => {
    const late = new Date("2026-10-09T23:59:59.000Z");
    const early = new Date("2026-10-10T00:00:01.000Z");
    expect(daysBetweenUtc(late, early)).toBe(1);
    expect(daysBetweenUtc(early, late)).toBe(-1);
    expect(daysBetweenUtc(early, early)).toBe(0);
  });

  it("spans month and year ends", () => {
    expect(daysBetweenUtc(new Date("2026-12-31T10:00:00Z"), new Date("2027-01-02T01:00:00Z"))).toBe(
      2,
    );
  });
});

describe("utcDate", () => {
  it("is the UTC calendar day as YYYY-MM-DD, whatever the time", () => {
    expect(utcDate(new Date("2026-10-09T23:59:59.999Z"))).toBe("2026-10-09");
    expect(utcDate(new Date("2026-10-10T00:00:00.000Z"))).toBe("2026-10-10");
  });
});

describe("daysUntilDate", () => {
  const now = new Date("2026-10-10T15:00:00.000Z");

  it("counts the days from today to a YYYY-MM-DD date", () => {
    expect(daysUntilDate("2026-10-10", now)).toBe(0);
    expect(daysUntilDate("2026-10-25", now)).toBe(15);
  });

  it("is negative once the date has passed", () => {
    expect(daysUntilDate("2026-10-09", now)).toBe(-1);
  });

  it("is null without a date", () => {
    expect(daysUntilDate(null, now)).toBeNull();
  });
});
