import { describe, expect, it } from "vitest";
import { historyScoreText, historySummaryText, sessionTypeLabel } from "./history-view";

describe("sessionTypeLabel", () => {
  it("uses the session mode's own label, and shows an unknown type as it is", () => {
    expect(sessionTypeLabel("topic_practice")).toBe("Topic practice");
    expect(sessionTypeLabel("mistake_review")).toBe("Mistake review");
    expect(sessionTypeLabel("something_new")).toBe("something_new");
  });
});

describe("historyScoreText", () => {
  it("shows a verified score to one decimal", () => {
    expect(historyScoreText({ scoreVerified: true, scorePct: 66.666 })).toBe("66.7%");
  });

  it("does not present an unchecked score as a result", () => {
    expect(historyScoreText({ scoreVerified: false, scorePct: 90 })).toBe("Not verified");
  });

  it("shows a dash for a verified test that has no score", () => {
    expect(historyScoreText({ scoreVerified: true, scorePct: null })).toBe("—");
  });
});

describe("historySummaryText", () => {
  it("says there is nothing yet, not zero, for no tests", () => {
    expect(
      historySummaryText({ verifiedCount: 0, unverifiedCount: 0, averageScorePct: null }),
    ).toBe("You have not finished a test yet.");
  });

  it("states the average and how many tests it covers", () => {
    expect(historySummaryText({ verifiedCount: 1, unverifiedCount: 0, averageScorePct: 70 })).toBe(
      "Average 70.0% over 1 verified test.",
    );
    expect(
      historySummaryText({ verifiedCount: 3, unverifiedCount: 0, averageScorePct: 70.6 }),
    ).toBe("Average 70.6% over 3 verified tests.");
  });

  it("explains what was left out of the average", () => {
    expect(historySummaryText({ verifiedCount: 2, unverifiedCount: 1, averageScorePct: 70 })).toBe(
      "Average 70.0% over 2 verified tests. 1 older test is left out because its score was never checked against the answer key.",
    );
    expect(
      historySummaryText({ verifiedCount: 0, unverifiedCount: 2, averageScorePct: null }),
    ).toBe(
      "No average yet: 2 older tests are left out because their scores were never checked against the answer key.",
    );
  });
});
