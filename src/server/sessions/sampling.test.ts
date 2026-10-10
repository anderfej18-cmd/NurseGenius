import { describe, expect, it } from "vitest";
import { sampleWithoutReplacement, secureRandom } from "./sampling";

describe("sampleWithoutReplacement", () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it("returns the requested number of distinct items and leaves the input untouched", () => {
    const copy = [...items];
    const picked = sampleWithoutReplacement(items, 4, Math.random);
    expect(picked).toHaveLength(4);
    expect(new Set(picked).size).toBe(4);
    expect(items).toEqual(copy);
  });

  it("returns everything (shuffled) when asked for more than exist, and nothing for non-positive counts", () => {
    expect(sampleWithoutReplacement(items, 99, Math.random).sort((a, b) => a - b)).toEqual(items);
    expect(sampleWithoutReplacement(items, 0, Math.random)).toEqual([]);
    expect(sampleWithoutReplacement(items, -3, Math.random)).toEqual([]);
    expect(sampleWithoutReplacement([], 3, Math.random)).toEqual([]);
  });

  it("is deterministic for a fixed random source", () => {
    const fixed = () => 0;
    expect(sampleWithoutReplacement(items, 3, fixed)).toEqual([1, 2, 3]);
  });

  it("gives every item a similar chance over many draws", () => {
    const hits = new Map<number, number>();
    for (let i = 0; i < 20_000; i++) {
      for (const item of sampleWithoutReplacement(items, 3, secureRandom))
        hits.set(item, (hits.get(item) ?? 0) + 1);
    }
    for (const item of items) expect(hits.get(item)!).toBeGreaterThan(5_000 * 0.9); // expected 6000
  });
});

describe("secureRandom", () => {
  it("stays within [0, 1)", () => {
    for (let i = 0; i < 1000; i++) {
      const value = secureRandom();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
