import { describe, expect, it } from "vitest";
import { profileFacts, type ProfileSource } from "./profile-view";

const NOW = new Date("2026-10-09T10:00:00.000Z");

const profile = (overrides: Partial<ProfileSource> = {}): ProfileSource => ({
  first_name: "Ada",
  last_name: "Obi",
  username: "NurseAda",
  email: "ada@example.com",
  exam_preference: "RN",
  exam_date: "2026-11-08",
  tier: "erudite",
  expiry_date: "2026-12-01T00:00:00.000Z",
  questions_today: 12,
  last_question_date: "2026-10-09",
  ...overrides,
});

const value = (facts: { label: string; value: string }[], label: string) =>
  facts.find((fact) => fact.label === label)?.value;

describe("profileFacts: your details", () => {
  it("shows what the profile holds", () => {
    const { details } = profileFacts(profile(), NOW, 500, 150);
    expect(value(details, "Name")).toBe("Ada Obi");
    expect(value(details, "Username")).toBe("NurseAda");
    expect(value(details, "Email")).toBe("ada@example.com");
    expect(value(details, "Studying for")).toBe("RN");
    expect(value(details, "Exam date")).toBe("8 Nov 2026 · Your exam is in 30 days.");
  });

  it("says plainly what is not set, without inventing it", () => {
    const { details } = profileFacts(
      profile({
        first_name: null,
        last_name: null,
        username: null,
        email: null,
        exam_preference: null,
        exam_date: null,
      }),
      NOW,
      500,
      150,
    );
    expect(value(details, "Name")).toBe("Not set");
    expect(value(details, "Username")).toBe("Not set");
    expect(value(details, "Email")).toBe("Not set");
    expect(value(details, "Studying for")).toBe("Not set");
    expect(value(details, "Exam date")).toBe("Not set");
  });

  it("words the exam preference both ways", () => {
    expect(
      value(
        profileFacts(profile({ exam_preference: "Both" }), NOW, 500, 150).details,
        "Studying for",
      ),
    ).toBe("RN and RM");
  });
});

describe("profileFacts: your plan", () => {
  it("shows the tier, its end, today's use against the daily limit, and the biggest test", () => {
    const { plan } = profileFacts(profile(), NOW, 500, 150);
    expect(value(plan, "Plan")).toBe("Erudite");
    expect(value(plan, "Access until")).toBe("1 Dec 2026");
    expect(value(plan, "Questions today")).toBe("12 of 500");
    expect(value(plan, "Largest test")).toBe("150 questions");
  });

  it("counts yesterday's questions as none today, as the server does", () => {
    const { plan } = profileFacts(profile({ last_question_date: "2026-10-08" }), NOW, 500, 150);
    expect(value(plan, "Questions today")).toBe("0 of 500");
  });

  it("shows no limit and no end date when there are none", () => {
    const { plan } = profileFacts(profile({ tier: "scholar", expiry_date: null }), NOW, null, 250);
    expect(value(plan, "Questions today")).toBe("12 (no daily limit)");
    expect(value(plan, "Access until")).toBe("No end date");
  });
});
