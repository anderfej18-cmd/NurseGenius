import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Fitness tests for the design system: they read the source and fail when a rule of
// docs/design/DESIGN.md is broken, so the system cannot erode one page at a time.

const root = resolve(__dirname, "../..");
const src = join(root, "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

/** Component and route source: where the interface is written. Tests are excluded. */
const interfaceFiles = [...walk(join(src, "components")), ...walk(join(src, "routes"))].filter(
  (file) =>
    /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file) && !file.endsWith("routeTree.gen.ts"),
);

const read = (file: string): string => readFileSync(file, "utf8");
const where = (file: string): string => relative(root, file);

/**
 * Files allowed to name raw colours. chart.tsx holds selectors that match Recharts' own default stroke
 * values ([stroke='#ccc']) so they can be overridden with tokens; it draws nothing with them.
 */
const RAW_COLOUR_EXCEPTIONS = [join("components", "ui", "chart.tsx")];

/** Every file whose text matches the pattern, as "path:line". */
function findAll(pattern: RegExp, skip: readonly string[] = []): string[] {
  const hits: string[] = [];
  for (const file of interfaceFiles) {
    if (skip.some((fragment) => file.endsWith(fragment))) continue;
    read(file)
      .split("\n")
      .forEach((line, index) => {
        if (pattern.test(line)) hits.push(`${where(file)}:${index + 1}`);
      });
  }
  return hits;
}

/**
 * Paths already rebuilt to the new system, where the stricter rules also apply (gap instead of
 * space-x/y, size-* for squares). The list grows with each phase until it covers the whole interface.
 */
const REDESIGNED = [
  join("components", "landing"),
  join("components", "auth"),
  join("components", "app"),
  join("components", "PublicHeader.tsx"),
  join("components", "SignedInPage.tsx"),
  join("components", "NotificationBell.tsx"),
  join("components", "ui"),
  join("components", "StatusPages.tsx"),
  join("components", "ThemeControl.tsx"),
  join("routes", "index.tsx"),
  join("routes", "auth.tsx"),
  join("routes", "onboarding.tsx"),
  join("components", "exam"),
  join("components", "QuestionActions.tsx"),
  join("components", "QuestionHelp.tsx"),
  join("components", "SimilarQuestions.tsx"),
  join("routes", "_app", "exam.start.tsx"),
  join("routes", "_app", "exam.$examId.results.tsx"),
  join("routes", "_app", "history.tsx"),
  join("routes", "exam.$examId.index.tsx"),
  join("components", "charts"),
  join("components", "dashboard"),
  join("components", "progress"),
  join("components", "InsightCard.tsx"),
  join("components", "SignedInPage.tsx"),
  join("components", "app"),
  join("routes", "_app", "dashboard.tsx"),
  join("routes", "_app", "today.tsx"),
  join("routes", "_app", "mastery.tsx"),
  join("routes", "_app", "analysis.tsx"),
  join("routes", "_app", "plan.tsx"),
  join("routes", "_app", "achievements.tsx"),
  join("routes", "_app", "topics.tsx"),
  join("routes", "_app", "mistakes.tsx"),
  join("routes", "_app", "bookmarks.tsx"),
  join("routes", "_app", "notifications.tsx"),
  join("routes", "_app", "friends.tsx"),
  join("routes", "_app", "leaderboard.tsx"),
  join("routes", "_app", "profile.tsx"),
  join("routes", "_app", "payments.tsx"),
  join("routes", "test.$token.tsx"),
  join("components", "QuestionPreview.tsx"),
  join("components", "LeaderboardTable.tsx"),
  join("components", "admin"),
  join("routes", "_app", "admin.tsx"),
];

function findAllIn(paths: readonly string[], pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const file of interfaceFiles) {
    if (!paths.some((fragment) => file.includes(fragment))) continue;
    read(file)
      .split("\n")
      .forEach((line, index) => {
        if (pattern.test(line)) hits.push(`${where(file)}:${index + 1}`);
      });
  }
  return hits;
}

describe("the design system holds across the interface", () => {
  it("finds the interface files it is meant to check", () => {
    expect(interfaceFiles.length).toBeGreaterThan(40);
  });

  it("uses semantic tokens only: no hex, rgb, hsl or oklch literals", () => {
    expect(
      findAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/, RAW_COLOUR_EXCEPTIONS),
    ).toEqual([]);
  });

  it("uses no Tailwind palette colours (bg-red-500 and the like)", () => {
    expect(
      findAll(
        /\b(?:bg|text|border|ring|fill|stroke|from|to|via|divide|outline|decoration|shadow)-(?:red|green|blue|amber|yellow|slate|gray|zinc|neutral|stone|emerald|teal|cyan|sky|indigo|violet|purple|pink|rose|orange|lime|fuchsia)-\d{2,3}\b/,
      ),
    ).toEqual([]);
  });

  it("has dropped the old gradient and glow utilities", () => {
    expect(findAll(/\b(?:bg-hero|shadow-glow|bg-card-soft|shadow-soft|primary-glow)\b/)).toEqual(
      [],
    );
  });

  it("has no gradient text or gradient backgrounds", () => {
    expect(findAll(/\bbg-clip-text\b|\bbg-gradient-|\bbg-linear-to-/)).toEqual([]);
  });

  it("never transitions `all`", () => {
    expect(findAll(/\btransition-all\b/)).toEqual([]);
  });

  it("does not hand-roll a focus outline that bypasses the shared ring", () => {
    expect(
      findAll(/\boutline-none\b(?!.*focus-ring)/).filter((hit) => !hit.includes("components/ui/")),
    ).toEqual([]);
  });

  it("uses gap, not space-x or space-y, in everything already rebuilt", () => {
    expect(findAllIn(REDESIGNED, /\bspace-[xy]-/)).toEqual([]);
  });

  it("uses size-* for equal width and height in everything already rebuilt", () => {
    const equalSides = /\bw-(\d+(?:\.\d+)?)\s+h-\1(?![\d./])|\bh-(\d+(?:\.\d+)?)\s+w-\2(?![\d./])/;
    expect(findAllIn(REDESIGNED, equalSides)).toEqual([]);
  });
});
