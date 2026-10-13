import { describe, expect, it } from "vitest";
import {
  areaPath,
  linePath,
  nearestIndex,
  percentTicks,
  xAt,
  yAt,
  type Plot,
} from "./chart-geometry";

const plot: Plot = {
  width: 400,
  height: 200,
  padding: { top: 10, right: 20, bottom: 30, left: 40 },
};

describe("chart geometry", () => {
  it("spreads points evenly between the left and right edges of the plot", () => {
    expect(xAt(plot, 0, 5)).toBe(40);
    expect(xAt(plot, 4, 5)).toBe(380);
    expect(xAt(plot, 2, 5)).toBe(210);
  });

  it("centres a single point instead of dividing by zero", () => {
    expect(xAt(plot, 0, 1)).toBe(210);
    expect(nearestIndex(plot, 5, 1)).toBe(0);
  });

  it("puts 0 on the baseline and 100 at the top, and clamps anything outside", () => {
    expect(yAt(plot, 0)).toBe(170);
    expect(yAt(plot, 100)).toBe(10);
    expect(yAt(plot, 50)).toBe(90);
    expect(yAt(plot, -20)).toBe(170);
    expect(yAt(plot, 140)).toBe(10);
  });

  it("finds the closest point to the pointer and never leaves the series", () => {
    expect(nearestIndex(plot, 0, 5)).toBe(0);
    expect(nearestIndex(plot, 400, 5)).toBe(4);
    expect(nearestIndex(plot, 205, 5)).toBe(2);
    expect(nearestIndex(plot, 130, 5)).toBe(1);
  });

  it("draws straight segments only, so no value is invented between points", () => {
    const points = [
      { x: 0, y: 10 },
      { x: 10, y: 20 },
    ];
    expect(linePath(points)).toBe("M0.0 10.0 L10.0 20.0");
    expect(areaPath(points, 50)).toBe("M0.0 10.0 L10.0 20.0 L10.0 50.0 L0.0 50.0 Z");
    expect(areaPath([], 50)).toBe("");
  });

  it("keeps the gridlines few on a short chart", () => {
    expect(percentTicks(120)).toEqual([0, 50, 100]);
    expect(percentTicks(220)).toEqual([0, 25, 50, 75, 100]);
  });
});
