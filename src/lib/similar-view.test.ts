import { describe, expect, it } from "vitest";
import { similarityReasonsText } from "./similar-view";

describe("similarityReasonsText", () => {
  it("lists why a question was recommended, in plain words, in a fixed order", () => {
    expect(
      similarityReasonsText(["shared_tags", "same_topic", "similar_wording", "same_difficulty"]),
    ).toBe("Same topic · Similar difficulty · Shared tags · Similar wording");
  });

  it("words each reason", () => {
    expect(similarityReasonsText(["same_subtopic"])).toBe("Same subtopic");
    expect(similarityReasonsText(["adjacent_difficulty"])).toBe("Close in difficulty");
  });

  it("says nothing for no reasons or one it does not know", () => {
    expect(similarityReasonsText([])).toBe("");
    expect(similarityReasonsText(["telepathy"])).toBe("");
  });
});
