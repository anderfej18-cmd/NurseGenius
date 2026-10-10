import { describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/app-errors";
import { offsetBounds, toOffsetPage } from "./pagination";
import { MAX_OFFSET } from "./types";

describe("offsetBounds", () => {
  it("defaults to the first page of 20", () => {
    expect(offsetBounds({})).toEqual({ offset: 0, limit: 20 });
  });

  it("clamps the limit between 1 and 50", () => {
    expect(offsetBounds({ limit: 9999 }).limit).toBe(50);
    expect(offsetBounds({ limit: 0 }).limit).toBe(1);
    expect(offsetBounds({ limit: -5 }).limit).toBe(1);
  });

  it("rejects negative or excessive offsets", () => {
    expect(() => offsetBounds({ offset: -1 })).toThrow(ValidationError);
    expect(() => offsetBounds({ offset: MAX_OFFSET + 1 })).toThrow(ValidationError);
    expect(offsetBounds({ offset: MAX_OFFSET }).offset).toBe(MAX_OFFSET);
  });
});

describe("toOffsetPage", () => {
  it("trims the extra row and points at the next offset", () => {
    expect(toOffsetPage([1, 2, 3], 2, 10)).toEqual({ items: [1, 2], nextOffset: 12 });
  });

  it("has no next offset on the last page", () => {
    expect(toOffsetPage([1, 2], 2, 0)).toEqual({ items: [1, 2], nextOffset: null });
    expect(toOffsetPage([], 2, 0)).toEqual({ items: [], nextOffset: null });
  });
});
