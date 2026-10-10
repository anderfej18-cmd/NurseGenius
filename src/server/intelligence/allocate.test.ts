import { describe, expect, it } from "vitest";
import { allocate } from "./allocate";

describe("allocate", () => {
  it("splits a total in proportion to the weights, in whole numbers that add up", () => {
    expect(allocate(10, [1, 1])).toEqual([5, 5]);
    expect(allocate(10, [3, 1])).toEqual([8, 2]); // 7.5 and 2.5: the larger remainder tie goes to the earlier
    expect(allocate(100, [50, 30, 20])).toEqual([50, 30, 20]);
  });

  it("gives leftover units to the largest remainders", () => {
    // Exact shares 3.33.., 3.33.., 3.33..: one spare unit goes to the first.
    expect(allocate(10, [1, 1, 1])).toEqual([4, 3, 3]);
    // Exact shares 1.8 and 1.2 of 3 → floors 1, 1, spare to the larger remainder (0.8).
    expect(allocate(3, [3, 2])).toEqual([2, 1]);
  });

  it("always adds up to the total", () => {
    for (const total of [0, 1, 7, 29, 100, 1001]) {
      for (const weights of [[1], [1, 2, 3], [0.1, 0.7, 0.2], [5, 5, 5, 5, 5, 5, 5]]) {
        expect(allocate(total, weights).reduce((a, b) => a + b, 0)).toBe(total);
      }
    }
  });

  it("splits evenly when no weight is positive, instead of dividing by zero", () => {
    expect(allocate(10, [0, 0])).toEqual([5, 5]);
    expect(allocate(7, [0, 0, 0])).toEqual([3, 2, 2]);
  });

  it("gives nothing to a zero weight beside a positive one", () => {
    expect(allocate(10, [0, 4])).toEqual([0, 10]);
  });

  it("handles a total of zero and an empty list", () => {
    expect(allocate(0, [1, 2])).toEqual([0, 0]);
    expect(allocate(5, [])).toEqual([]);
  });
});
