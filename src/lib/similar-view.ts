// Wording for the "similar questions" list. Pure, so the screen stays humble and the words are tested.

const ORDER: ReadonlyArray<readonly [string, string]> = [
  ["same_topic", "Same topic"],
  ["same_subtopic", "Same subtopic"],
  ["same_difficulty", "Similar difficulty"],
  ["adjacent_difficulty", "Close in difficulty"],
  ["shared_tags", "Shared tags"],
  ["similar_wording", "Similar wording"],
];

/** Why a question was recommended, from the reasons the server gave. */
export function similarityReasonsText(reasons: readonly string[]): string {
  return ORDER.filter(([code]) => reasons.includes(code))
    .map(([, text]) => text)
    .join(" · ");
}
