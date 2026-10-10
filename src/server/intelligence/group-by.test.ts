import { describe, expect, it } from "vitest";
import { groupBy } from "./group-by";
import { clamp, clamp01, mean, median } from "./statistics";

describe("groupBy", () => {
  it("keeps first-seen key order and item order", () => {
    const groups = groupBy(["b1", "a1", "b2", "a2"], (item) => item[0]);
    expect([...groups.keys()]).toEqual(["b", "a"]);
    expect(groups.get("b")).toEqual(["b1", "b2"]);
  });

  it("returns an empty map for no items", () => {
    expect(groupBy([], (item: string) => item).size).toBe(0);
  });
});

describe("statistics", () => {
  it("computes the mean", () => {
    expect(mean([1, 2, 3, 6])).toBe(3);
  });

  it("computes the median of odd and even counts without reordering the input", () => {
    const values = [5, 1, 3];
    expect(median(values)).toBe(3);
    expect(values).toEqual([5, 1, 3]);
    expect(median([1, 2, 3, 10])).toBe(2.5);
    expect(median([7])).toBe(7);
  });

  it("clamps to the unit interval", () => {
    expect([clamp01(-0.2), clamp01(0.4), clamp01(1.3)]).toEqual([0, 0.4, 1]);
  });

  it("clamps to any interval", () => {
    expect([clamp(5, 10, 100), clamp(50, 10, 100), clamp(500, 10, 100)]).toEqual([10, 50, 100]);
  });
});
