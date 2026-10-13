import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/color-contrast";
import {
  CONTRAST_MINIMUM,
  CONTRAST_PAIRS,
  PRIMITIVES,
  SEMANTIC,
  SEMANTIC_TOKENS,
  resolveToken,
  type PrimitiveName,
  type ThemeName,
} from "@/lib/design-tokens";

const root = resolve(__dirname, "../..");
const css = readFileSync(resolve(root, "src/styles.css"), "utf8");

/** The declarations of the first rule whose selector matches, as name -> value. */
function declarationsOf(selector: RegExp): Map<string, string> {
  const match = new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`, selector.flags).exec(css);
  if (!match) throw new Error(`No rule found for ${selector}`);
  const entries = new Map<string, string>();
  for (const line of match[1].split(";")) {
    const decl = /^\s*(--[\w-]+)\s*:\s*([\s\S]+?)\s*$/.exec(line);
    if (decl) entries.set(decl[1], decl[2].replace(/\s+/g, " "));
  }
  return entries;
}

const primitivesInCss = declarationsOf(/^:root(?=\s*\{)/m);
const lightInCss = declarationsOf(/^:root,\s*\.theme-fixed/m);
const darkInCss = declarationsOf(/^\.dark(?=\s*\{)/m);

const cssValueFor = (theme: ThemeName, token: string): string | undefined =>
  (theme === "light" ? lightInCss : darkInCss).get(`--${token}`);

describe("the stylesheet declares exactly the tokens in design-tokens.ts", () => {
  it("has every primitive, with the same colour", () => {
    for (const [name, hex] of Object.entries(PRIMITIVES)) {
      expect(primitivesInCss.get(`--${name}`)?.toLowerCase(), name).toBe(hex.toLowerCase());
    }
    const declared = [...primitivesInCss.keys()].map((key) => key.slice(2));
    expect(declared.sort()).toEqual(Object.keys(PRIMITIVES).sort());
  });

  it.each(["light", "dark"] as const)(
    "points every %s semantic token at the same primitive",
    (theme) => {
      for (const token of SEMANTIC_TOKENS) {
        const value = SEMANTIC[theme][token];
        const declared = cssValueFor(theme, token);
        if (typeof value === "string") {
          expect(declared, `${theme} --${token}`).toBe(`var(--${value})`);
        } else {
          // A translucent token is written as rgb(255 255 255 / alpha); the primitive must be white.
          expect(PRIMITIVES[value.primitive], `${theme} --${token} base`).toBe("#FFFFFF");
          expect(declared, `${theme} --${token}`).toBe(`rgb(255 255 255 / ${value.alpha})`);
        }
      }
    },
  );

  it("only uses primitives that exist", () => {
    for (const theme of ["light", "dark"] as const) {
      for (const token of SEMANTIC_TOKENS) {
        const value = SEMANTIC[theme][token];
        const name: PrimitiveName = typeof value === "string" ? value : value.primitive;
        expect(PRIMITIVES[name], `${theme} ${token}`).toBeDefined();
      }
    }
  });

  it("exposes every semantic token to Tailwind as a colour utility", () => {
    for (const token of SEMANTIC_TOKENS) {
      expect(css, `--color-${token}`).toContain(`--color-${token}: var(--${token});`);
    }
  });
});

describe("the written system matches the tokens", () => {
  const doc = readFileSync(resolve(root, "docs/design/DESIGN.md"), "utf8").toUpperCase();

  it("documents every primitive colour by its hex value", () => {
    for (const [name, hex] of Object.entries(PRIMITIVES)) {
      expect(doc, `${name} ${hex}`).toContain(hex.toUpperCase());
    }
  });
});

describe("contrast", () => {
  const measured = (["light", "dark"] as const).flatMap((theme) =>
    CONTRAST_PAIRS.map((pair) => ({
      theme,
      pair,
      ratio: contrastRatio(
        resolveToken(theme, pair.foreground, pair.background),
        resolveToken(theme, pair.background, "background"),
      ),
    })),
  );

  it("checks a meaningful number of pairs in both themes", () => {
    expect(CONTRAST_PAIRS.length).toBeGreaterThanOrEqual(50);
    expect(measured).toHaveLength(CONTRAST_PAIRS.length * 2);
  });

  it.each(
    measured.map(
      (m) =>
        [`${m.theme}: ${m.pair.foreground} on ${m.pair.background} (${m.pair.use})`, m] as const,
    ),
  )("%s", (_name, { pair, ratio }) => {
    expect(ratio).toBeGreaterThanOrEqual(CONTRAST_MINIMUM[pair.floor]);
  });
});

describe("the system's shape", () => {
  it("keeps the light and dark themes complete and distinct", () => {
    for (const token of SEMANTIC_TOKENS) {
      expect(SEMANTIC.light[token], `light ${token}`).toBeDefined();
      expect(SEMANTIC.dark[token], `dark ${token}`).toBeDefined();
    }
    // Dark is its own ramp: the page and card surfaces differ from the light ones.
    expect(resolveToken("dark", "background")).not.toBe(resolveToken("light", "background"));
    expect(resolveToken("dark", "card")).not.toBe(resolveToken("light", "card"));
  });

  it("never uses pure black or pure white as the page", () => {
    for (const theme of ["light", "dark"] as const) {
      expect(["#000000", "#FFFFFF"]).not.toContain(resolveToken(theme, "background"));
    }
  });

  it("raises surfaces with elevation on the dark theme", () => {
    const lum = (hex: string) => contrastRatio(hex, "#000000");
    const order = ["background", "card", "raised"] as const;
    const levels = order.map((token) => lum(resolveToken("dark", token)));
    expect(levels[0]).toBeLessThan(levels[1]);
    expect(levels[1]).toBeLessThan(levels[2]);
  });

  it("declares the self-hosted font files it points at", () => {
    for (const file of [
      "bricolage-grotesque-latin-wght.woff2",
      "geist-latin-wght.woff2",
      "geist-mono-latin-wght.woff2",
    ]) {
      expect(css).toContain(`/fonts/${file}`);
      expect(() => readFileSync(resolve(root, "public/fonts", file))).not.toThrow();
    }
    expect(css).toContain("font-display: swap");
  });

  it("limits motion to the two named curves", () => {
    expect(css).toContain("--ease-out: cubic-bezier(0.23, 1, 0.32, 1)");
    expect(css).toContain("--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
