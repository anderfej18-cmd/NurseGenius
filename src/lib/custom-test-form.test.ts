import { describe, expect, it } from "vitest";
import {
  type CustomTestDraft,
  type Schedule,
  defaultSchedule,
  hasErrors,
  questionCountOf,
  sampleQuestions,
  toLocalInput,
  validateCustomTest,
  validateSchedule,
  windowEnd,
  windowMinutes,
} from "./custom-test-form";

const NOW = new Date("2026-10-12T10:00:00");
const SCHEDULE: Schedule = {
  startsAt: "2026-10-12T12:00",
  windowValue: 24,
  windowUnit: "hours",
  durationMinutes: 60,
};
const FROM_BANK: CustomTestDraft = {
  ...SCHEDULE,
  title: "Maternal review",
  mode: "existing",
  allocations: [
    { topic: "Antenatal care", count: 10, available: 84 },
    { topic: "Postnatal care", count: 5, available: 47 },
  ],
  uploadedCount: 0,
};
const FROM_FILE: CustomTestDraft = {
  ...FROM_BANK,
  mode: "upload",
  allocations: [],
  uploadedCount: 12,
};

describe("windowMinutes and windowEnd", () => {
  it("converts minutes, hours and days", () => {
    expect(windowMinutes(30, "minutes")).toBe(30);
    expect(windowMinutes(2, "hours")).toBe(120);
    expect(windowMinutes(1.5, "days")).toBe(2160);
  });

  it("ends the window the chosen length after the start, and is null while either is unusable", () => {
    expect(windowEnd(SCHEDULE)?.getTime()).toBe(new Date("2026-10-13T12:00").getTime());
    expect(windowEnd({ ...SCHEDULE, startsAt: "" })).toBeNull();
    expect(windowEnd({ ...SCHEDULE, windowValue: Number.NaN })).toBeNull();
  });
});

describe("validateSchedule", () => {
  it("accepts a start now or soon, a window within 10 minutes to 90 days and 10 to 180 minutes", () => {
    expect(validateSchedule(SCHEDULE, NOW)).toEqual({});
    expect(validateSchedule({ ...SCHEDULE, startsAt: "2026-10-12T09:57" }, NOW)).toEqual({});
    expect(
      validateSchedule(
        { ...SCHEDULE, windowValue: 10, windowUnit: "minutes", durationMinutes: 10 },
        NOW,
      ),
    ).toEqual({});
    expect(
      validateSchedule(
        { ...SCHEDULE, windowValue: 90, windowUnit: "days", durationMinutes: 180 },
        NOW,
      ),
    ).toEqual({});
  });

  it("names an empty or past start", () => {
    expect(validateSchedule({ ...SCHEDULE, startsAt: "" }, NOW).start).toBeDefined();
    expect(validateSchedule({ ...SCHEDULE, startsAt: "2026-10-12T09:00" }, NOW).start).toContain(
      "past",
    );
  });

  it("names a window outside 10 minutes to 90 days, however it is spelled", () => {
    expect(
      validateSchedule({ ...SCHEDULE, windowValue: 9, windowUnit: "minutes" }, NOW).window,
    ).toBeDefined();
    expect(
      validateSchedule({ ...SCHEDULE, windowValue: 91, windowUnit: "days" }, NOW).window,
    ).toBeDefined();
    expect(validateSchedule({ ...SCHEDULE, windowValue: Number.NaN }, NOW).window).toBeDefined();
    expect(validateSchedule({ ...SCHEDULE, windowValue: 0 }, NOW).window).toBeDefined();
  });

  it("names a duration outside 10 to 180 minutes or not whole", () => {
    for (const durationMinutes of [9, 181, 30.5, Number.NaN])
      expect(validateSchedule({ ...SCHEDULE, durationMinutes }, NOW).duration).toBeDefined();
  });

  it("names a window that would already be over", () => {
    const stale = {
      ...SCHEDULE,
      startsAt: "2026-10-12T09:57",
      windowValue: 1,
      windowUnit: "minutes" as const,
    };
    expect(validateSchedule(stale, NOW).window).toBeDefined();
  });
});

describe("questionCountOf", () => {
  it("adds up the counts asked from the bank, and uses the file's size for an upload", () => {
    expect(questionCountOf(FROM_BANK)).toBe(15);
    expect(questionCountOf(FROM_FILE)).toBe(12);
  });
});

describe("validateCustomTest", () => {
  it("accepts a complete bank test and a complete upload", () => {
    expect(hasErrors(validateCustomTest(FROM_BANK, NOW))).toBe(false);
    expect(hasErrors(validateCustomTest(FROM_FILE, NOW))).toBe(false);
  });

  it("asks for a title and at least one subcategory", () => {
    const errors = validateCustomTest({ ...FROM_BANK, title: "  ", allocations: [] }, NOW);
    expect(Object.keys(errors).sort()).toEqual(["title", "topics"]);
  });

  it("rejects a count above the subcategory's pool, naming that subcategory, and a count below one", () => {
    const errors = validateCustomTest(
      {
        ...FROM_BANK,
        allocations: [
          { topic: "Antenatal care", count: 85, available: 84 },
          { topic: "Postnatal care", count: 0, available: 47 },
          { topic: "Neonatal care", count: 3, available: 38 },
        ],
      },
      NOW,
    );
    expect(Object.keys(errors.counts ?? {})).toEqual(["Antenatal care", "Postnatal care"]);
    expect(errors.counts?.["Antenatal care"]).toContain("Only 84");
  });

  it("rejects a total above 250 across subcategories, but not before the single counts are fixed", () => {
    const big = {
      ...FROM_BANK,
      allocations: [
        { topic: "A", count: 200, available: 300 },
        { topic: "B", count: 51, available: 300 },
      ],
    };
    expect(validateCustomTest(big, NOW).total).toContain("251");
    expect(
      validateCustomTest({ ...big, allocations: [{ topic: "A", count: 400, available: 300 }] }, NOW)
        .total,
    ).toBeUndefined();
  });

  it("asks an upload for a valid file", () => {
    expect(validateCustomTest({ ...FROM_FILE, uploadedCount: 0 }, NOW).file).toBeDefined();
  });

  it("includes the schedule's errors, so one result decides whether Go live is enabled", () => {
    const errors = validateCustomTest({ ...FROM_BANK, startsAt: "", durationMinutes: 5 }, NOW);
    expect(Object.keys(errors).sort()).toEqual(["duration", "start"]);
  });
});

describe("sampleQuestions", () => {
  const pool = Array.from({ length: 20 }, (_, index) => index);

  it("returns the requested number of distinct items from the pool and leaves the pool alone", () => {
    const picked = sampleQuestions(pool, 8);
    expect(picked).toHaveLength(8);
    expect(new Set(picked).size).toBe(8);
    expect(picked.every((item) => pool.includes(item))).toBe(true);
    expect(pool).toEqual(Array.from({ length: 20 }, (_, index) => index));
  });

  it("returns the whole pool, shuffled, when asked for as many as it holds or more", () => {
    expect([...sampleQuestions(pool, 20)].sort((a, b) => a - b)).toEqual(pool);
    expect(sampleQuestions(pool, 99)).toHaveLength(20);
    expect(sampleQuestions(pool, 0)).toEqual([]);
  });

  it("is decided by the random source it is given", () => {
    expect(sampleQuestions([1, 2, 3, 4], 4, () => 0)).toEqual([2, 3, 4, 1]);
  });

  it("gives every item a chance to come first", () => {
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const firsts = new Set(
      Array.from({ length: 200 }, () => sampleQuestions([1, 2, 3, 4], 1, random)[0]),
    );
    expect(firsts.size).toBe(4);
  });
});

describe("toLocalInput and defaultSchedule", () => {
  it("writes a date the way a datetime-local input does, in local time", () => {
    expect(toLocalInput(new Date(2026, 9, 5, 7, 3))).toBe("2026-10-05T07:03");
  });

  it("starts now, stays open a day and allows an hour, and that is a valid schedule", () => {
    const schedule = defaultSchedule(NOW);
    expect(schedule).toEqual({
      startsAt: "2026-10-12T10:00",
      windowValue: 24,
      windowUnit: "hours",
      durationMinutes: 60,
    });
    expect(validateSchedule(schedule, NOW)).toEqual({});
  });
});
