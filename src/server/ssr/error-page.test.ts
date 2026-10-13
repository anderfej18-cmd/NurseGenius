import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/color-contrast";
import { PRIMITIVES } from "@/lib/design-tokens";
import { renderErrorPage } from "./error-page";

describe("renderErrorPage", () => {
  const html = renderErrorPage();

  it("is a complete page with a title, a heading and a way out", () => {
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("<title>This page did not load");
    expect(html).toContain("<h1>This page did not load</h1>");
    expect(html).toContain('href="/"');
    expect(html).toContain("location.reload()");
  });

  it("uses only colours from the design tokens", () => {
    const used = new Set((html.match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((hex) => hex.toUpperCase()));
    const known = new Set(Object.values(PRIMITIVES).map((hex) => hex.toUpperCase()));
    expect([...used].filter((hex) => !known.has(hex))).toEqual([]);
  });

  it("keeps its text readable and its buttons visible", () => {
    expect(contrastRatio(PRIMITIVES["ink-950"], PRIMITIVES["sand-50"])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(PRIMITIVES["ink-600"], PRIMITIVES["sand-50"])).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(PRIMITIVES["evergreen-50"], PRIMITIVES["evergreen-700"]),
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(PRIMITIVES["ink-500"], PRIMITIVES["sand-50"])).toBeGreaterThanOrEqual(3);
  });

  it("shows no stack trace, path or technical wording", () => {
    expect(html).not.toMatch(/stack|at \w+\.|node_modules|error:|exception/i);
  });

  it("is language-tagged, scalable and shows keyboard focus", () => {
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('name="viewport" content="width=device-width, initial-scale=1"');
    expect(html).toContain(":focus-visible");
  });
});
