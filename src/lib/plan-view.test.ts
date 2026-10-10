import { describe, expect, it } from "vitest";
import { TIER_DAILY_LIMIT, TIER_SESSION_LIMIT } from "./exam-rules";
import { planPerks } from "./plan-view";

describe("planPerks", () => {
  it("states each paid plan's limits from the shared tier rules, so the page cannot disagree with the server", () => {
    expect(planPerks("erudite", 30)).toBe(
      `${TIER_DAILY_LIMIT.erudite} questions a day · up to ${TIER_SESSION_LIMIT.erudite} in one test`,
    );
    expect(planPerks("scholar", 30)).toBe(
      `Unlimited questions a day · up to ${TIER_SESSION_LIMIT.scholar} in one test`,
    );
  });

  it("falls back to the length of access for a plan it has no rules for", () => {
    expect(planPerks("custom", 30)).toBe("30 days of access");
  });

  it("makes no promise the product does not keep", () => {
    for (const name of ["erudite", "scholar", "custom"]) {
      expect(planPerks(name, 30)).not.toMatch(/AI/);
    }
  });
});
