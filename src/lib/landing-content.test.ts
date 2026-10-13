import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAX_SESSION_MINUTES,
  MIN_SESSION_MINUTES,
  TIER_DAILY_LIMIT,
  TIER_SESSION_LIMIT,
} from "@/lib/exam-rules";
import {
  FAQ,
  FOOTER,
  FOOTER_LINKS,
  HERO,
  LANDING_SECTIONS,
  NAV_LINKS,
  PLANS_SECTION,
  PRACTICE,
  PROGRESS,
  allLandingCopy,
} from "@/lib/landing-content";
import { masteryLevelText } from "@/lib/progress-view";
import { SELECTION_CHOICES, SELECTION_LABELS } from "@/lib/session-modes";

const root = resolve(__dirname, "../..");
const landingDir = join(root, "src/components/landing");
const landingFiles = readdirSync(landingDir)
  .filter((name) => name.endsWith(".tsx"))
  .map((name) => ({ name, text: readFileSync(join(landingDir, name), "utf8") }));
const indexSource = readFileSync(join(root, "src/routes/index.tsx"), "utf8");
const css = readFileSync(join(root, "src/styles.css"), "utf8");

const copy = allLandingCopy();
const wordCount = (text: string): number => text.trim().split(/\s+/).length;

describe("the landing page says only what is true and nothing it cannot back", () => {
  it("collects a meaningful amount of copy", () => {
    expect(copy.length).toBeGreaterThan(60);
  });

  it("has no testimonials, pass rates, customer counts or guarantees", () => {
    const claims =
      /testimonial|trusted by|pass rate|passed their|success stor|thousands of|millions of|\b\d+,\d{3}\b|guarantee|best[- ]in|#1\b|number one|rated \d/i;
    expect(copy.filter((line) => claims.test(line))).toEqual([]);
  });

  it("uses only numbers that come from the product's own rules", () => {
    const allowed = new Set<string>([
      String(MIN_SESSION_MINUTES),
      String(MAX_SESSION_MINUTES),
      ...Object.values(TIER_SESSION_LIMIT).map(String),
      ...Object.values(TIER_DAILY_LIMIT)
        .filter((limit): limit is number => limit !== null)
        .map(String),
    ]);
    const stray = copy.flatMap((line) =>
      (line.match(/\d+(?:\.\d+)?/g) ?? [])
        .filter((figure) => !allowed.has(figure))
        .map((figure) => `${figure} in "${line}"`),
    );
    expect(stray).toEqual([]);
  });

  it("uses no percentages", () => {
    expect(copy.filter((line) => line.includes("%"))).toEqual([]);
  });

  it("avoids the vocabulary and punctuation of generated marketing", () => {
    const banned =
      /\b(elevate|seamless(ly)?|unlock(s|ed|ing)?|supercharge|revolutioni[sz]e|cutting[- ]edge|next[- ]gen(eration)?|game[- ]changer|delve|tapestry|unleash|leverage|empower)\b|in the world of|oops/i;
    expect(copy.filter((line) => banned.test(line))).toEqual([]);
    expect(copy.filter((line) => line.includes("—") || line.includes("!"))).toEqual([]);
  });

  it("keeps the hero within the discipline: a short thesis and a short description", () => {
    expect(wordCount(HERO.headline)).toBeLessThanOrEqual(6);
    expect(wordCount(HERO.description)).toBeLessThanOrEqual(24);
  });

  it("writes buttons as verbs in sentence case", () => {
    for (const label of [
      HERO.primaryCta,
      HERO.secondaryCta,
      FOOTER.signIn,
      FOOTER.create,
      FOOTER.dashboard,
    ]) {
      const [first, ...rest] = label.split(" ");
      expect(first[0], label).toBe(first[0].toUpperCase());
      for (const word of rest) expect(word[0], label).toBe(word[0].toLowerCase());
    }
  });
});

describe("the page and the product's rules agree", () => {
  it("shows the tier limits the server enforces", () => {
    expect(PLANS_SECTION.dailyLimit("novice")).toBe(String(TIER_DAILY_LIMIT.novice));
    expect(PLANS_SECTION.dailyLimit("erudite")).toBe(String(TIER_DAILY_LIMIT.erudite));
    expect(PLANS_SECTION.dailyLimit("scholar")).toBe("Unlimited");
    for (const tier of PLANS_SECTION.tiers) {
      expect(PLANS_SECTION.testLimit(tier)).toBe(String(TIER_SESSION_LIMIT[tier]));
    }
  });

  it("states the free plan's limits in the hero note and the FAQ", () => {
    expect(HERO.note).toContain(String(TIER_DAILY_LIMIT.novice));
    expect(FAQ.items[0].answer).toContain(String(TIER_DAILY_LIMIT.novice));
    expect(FAQ.items[0].answer).toContain(String(TIER_SESSION_LIMIT.novice));
  });

  it("lists exactly the ways the start screen lets a student choose questions", () => {
    expect(PRACTICE.modes.map((mode) => mode.label)).toEqual(
      SELECTION_CHOICES.map((mode) => SELECTION_LABELS[mode].label),
    );
    expect(PRACTICE.modes).toHaveLength(4);
  });

  it("names the mastery levels the way the progress screens do", () => {
    expect(PROGRESS.levels.map((entry) => entry.label)).toEqual(
      PROGRESS.levels.map((entry) => masteryLevelText(entry.level)),
    );
    expect(PROGRESS.levels).toHaveLength(5);
  });
});

describe("every link and anchor leads somewhere", () => {
  const rendered = landingFiles.map((file) => file.text).join("\n");

  it("renders a section for every anchor the page links to", () => {
    for (const id of LANDING_SECTIONS) {
      expect(rendered, `#${id}`).toContain(`id="${id}"`);
    }
  });

  it("points the top bar and footer only at those sections", () => {
    for (const link of [...NAV_LINKS, ...FOOTER_LINKS]) {
      expect(LANDING_SECTIONS, link.label).toContain(link.href.slice(1));
    }
  });

  it("keeps the top bar to five links so it stays on one line", () => {
    expect(NAV_LINKS).toHaveLength(5);
  });

  it("links the hero's secondary action to a real section", () => {
    expect(readFileSync(join(landingDir, "Hero.tsx"), "utf8")).toContain('href="#how-it-works"');
  });
});

describe("the page keeps one fixed theme and a calm motion budget", () => {
  it("is wrapped in the fixed light theme", () => {
    expect(indexSource).toContain("theme-fixed");
    expect(css).toMatch(/:root,\s*\.theme-fixed/);
  });

  it("never reacts to a dark preference", () => {
    for (const file of landingFiles) {
      expect(file.text, file.name).not.toMatch(/\bdark:/);
    }
    expect(indexSource).not.toMatch(/\bdark:/);
  });

  it("offers no theme toggle on the public page", () => {
    for (const file of [...landingFiles, { name: "index.tsx", text: indexSource }]) {
      expect(file.text, file.name).not.toMatch(/ThemeControl|useTheme|setPreference/);
    }
  });

  it("has a skip link and a main landmark", () => {
    expect(indexSource).toContain('href="#main"');
    expect(indexSource).toContain('id="main"');
  });

  it("removes movement, keeps fades, and draws the trace at once under reduced motion", () => {
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/\.hero-in\s*\{[^}]*--rise:\s*0px/);
    expect(reduced).toMatch(/\.reveal\[data-reveal="pending"\]\s*\{[^}]*transform:\s*none/);
    expect(reduced).toMatch(/\.pulse-trace\s*\{[^}]*animation:\s*none/);
  });

  it("animates only transform, opacity and the trace's clip", () => {
    for (const keyframes of css.match(/@keyframes [\w-]+\s*\{[\s\S]*?\n\}/g) ?? []) {
      expect(keyframes).not.toMatch(/\b(width|height|top|left|margin|padding)\s*:/);
    }
  });
});
