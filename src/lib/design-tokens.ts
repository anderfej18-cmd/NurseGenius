// The NurseGenius design tokens as data. `src/styles.css` declares the same values as CSS custom
// properties and `design-tokens.test.ts` fails if the two drift apart or a pair stops meeting its
// contrast floor. Components never read this file: they use the CSS variables through Tailwind
// (`bg-card`, `text-muted-foreground`, ...). It exists so the system can be checked by a machine.
//
// Two tiers (better-colors): primitives name a value by hue and step and are never used in a
// component; semantic tokens name a job and are the only tier components reference.

export type ThemeName = "light" | "dark";

/** Tier 1: every colour the interface can show, named by hue and step. */
export const PRIMITIVES = {
  // Warm paper neutrals: the light theme's surfaces, borders and dividers.
  "sand-0": "#FFFFFF",
  "sand-25": "#FFFDF8",
  "sand-50": "#F6F3EC",
  "sand-100": "#EFEAE0",
  "sand-150": "#EBE5D9",
  "sand-200": "#E2DBCD",
  // Green-tinted ink: text and control edges on the light theme.
  "ink-500": "#72837B",
  "ink-600": "#56645F",
  "ink-950": "#13221F",
  // Night: the dark theme's own ramp (not an inversion of the light one).
  "night-950": "#0B1513",
  "night-925": "#0E1916",
  "night-900": "#111E1B",
  "night-850": "#172723",
  "night-500": "#6A8077",
  "night-300": "#9BAEA7",
  "night-100": "#E6EFEB",
  // Brand: evergreen carries actions on light; mint is the signal and carries actions on dark.
  "evergreen-50": "#F4FBF8",
  "evergreen-700": "#0E5A4F",
  "evergreen-800": "#0A443C",
  "mint-100": "#D8F5E8",
  "mint-300": "#62E4AE",
  "mint-400": "#3FD99A",
  "mint-800": "#123A2E",
  "mint-900": "#062019",
  // Status. Light uses dark, saturated steps (text on paper); dark uses light steps.
  "green-100": "#DDF1E6",
  "green-300": "#4ADE9A",
  "green-700": "#1B7750",
  "green-900": "#0F3326",
  "amber-100": "#F8E9CC",
  "amber-300": "#F2B45A",
  "amber-700": "#905507",
  "amber-900": "#3A2C10",
  "red-100": "#F9E0DC",
  "red-300": "#F2877F",
  "red-700": "#B4322B",
  "red-900": "#3D1C1A",
  "blue-100": "#DCE9F7",
  "blue-300": "#7DB3EE",
  "blue-700": "#2565A8",
  "blue-900": "#12293F",
  // Programme pathways. Teal marks RN, clay marks RM, and they appear only on RN/RM labels and charts.
  "teal-100": "#D5EFEA",
  "teal-300": "#4FD1BD",
  "teal-500": "#0E8A7A",
  "teal-700": "#0A6F63",
  "teal-900": "#0F3430",
  "clay-100": "#F6DFD4",
  "clay-300": "#F09A76",
  "clay-500": "#C8613D",
  "clay-700": "#9E4A28",
  "clay-900": "#3B2217",
} as const;

export type PrimitiveName = keyof typeof PRIMITIVES;

/** A semantic token points at a primitive, optionally with transparency (dark-theme borders). */
export type TokenValue = PrimitiveName | { primitive: PrimitiveName; alpha: number };

/** Tier 2: the roles. Names match the CSS custom properties without the leading `--`. */
export const SEMANTIC_TOKENS = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "raised",
  "sunken",
  "primary",
  "primary-foreground",
  "primary-strong",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "signal",
  "signal-foreground",
  "mark",
  "mark-foreground",
  "success",
  "success-foreground",
  "success-soft",
  "warning",
  "warning-foreground",
  "warning-soft",
  "destructive",
  "destructive-foreground",
  "destructive-soft",
  "info",
  "info-foreground",
  "info-soft",
  "border",
  "divider",
  "input",
  "ring",
  "rn",
  "rn-text",
  "rn-soft",
  "rm",
  "rm-text",
  "rm-soft",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
] as const;

export type SemanticToken = (typeof SEMANTIC_TOKENS)[number];

export const SEMANTIC: Record<ThemeName, Record<SemanticToken, TokenValue>> = {
  light: {
    background: "sand-50",
    foreground: "ink-950",
    card: "sand-25",
    "card-foreground": "ink-950",
    popover: "sand-0",
    "popover-foreground": "ink-950",
    raised: "sand-0",
    sunken: "sand-100",
    primary: "evergreen-700",
    "primary-foreground": "evergreen-50",
    "primary-strong": "evergreen-800",
    secondary: "sand-100",
    "secondary-foreground": "ink-950",
    muted: "sand-100",
    "muted-foreground": "ink-600",
    accent: "mint-100",
    "accent-foreground": "evergreen-800",
    signal: "mint-400",
    "signal-foreground": "mint-900",
    // The logo tile is the same evergreen and mint in both themes: a brand mark does not invert.
    mark: "evergreen-700",
    "mark-foreground": "mint-400",
    success: "green-700",
    "success-foreground": "sand-0",
    "success-soft": "green-100",
    warning: "amber-700",
    "warning-foreground": "sand-0",
    "warning-soft": "amber-100",
    destructive: "red-700",
    "destructive-foreground": "sand-0",
    "destructive-soft": "red-100",
    info: "blue-700",
    "info-foreground": "sand-0",
    "info-soft": "blue-100",
    border: "sand-200",
    divider: "sand-150",
    input: "ink-500",
    ring: "evergreen-700",
    rn: "teal-500",
    "rn-text": "teal-700",
    "rn-soft": "teal-100",
    rm: "clay-500",
    "rm-text": "clay-700",
    "rm-soft": "clay-100",
    "chart-1": "evergreen-700",
    "chart-2": "clay-500",
    "chart-3": "blue-700",
    "chart-4": "amber-700",
    "chart-5": "ink-500",
  },
  dark: {
    background: "night-950",
    foreground: "night-100",
    card: "night-900",
    "card-foreground": "night-100",
    popover: "night-850",
    "popover-foreground": "night-100",
    raised: "night-850",
    sunken: "night-925",
    primary: "mint-400",
    "primary-foreground": "mint-900",
    "primary-strong": "mint-300",
    secondary: "night-850",
    "secondary-foreground": "night-100",
    muted: "night-925",
    "muted-foreground": "night-300",
    accent: "mint-800",
    "accent-foreground": "mint-300",
    signal: "mint-400",
    "signal-foreground": "mint-900",
    mark: "evergreen-700",
    "mark-foreground": "mint-400",
    success: "green-300",
    "success-foreground": "night-950",
    "success-soft": "green-900",
    warning: "amber-300",
    "warning-foreground": "night-950",
    "warning-soft": "amber-900",
    destructive: "red-300",
    "destructive-foreground": "night-950",
    "destructive-soft": "red-900",
    info: "blue-300",
    "info-foreground": "night-950",
    "info-soft": "blue-900",
    border: { primitive: "sand-0", alpha: 0.09 },
    divider: { primitive: "sand-0", alpha: 0.06 },
    input: "night-500",
    ring: "mint-400",
    rn: "teal-300",
    "rn-text": "teal-300",
    "rn-soft": "teal-900",
    rm: "clay-300",
    "rm-text": "clay-300",
    "rm-soft": "clay-900",
    "chart-1": "mint-400",
    "chart-2": "clay-300",
    "chart-3": "blue-300",
    "chart-4": "amber-300",
    "chart-5": "night-300",
  },
};

/** The colour a token shows. A transparent token is composited over `backdrop` (its usual surface). */
export function resolveToken(
  theme: ThemeName,
  token: SemanticToken,
  backdrop: SemanticToken = "card",
): string {
  const value = SEMANTIC[theme][token];
  if (typeof value === "string") return PRIMITIVES[value];
  const under = resolveToken(theme, backdrop, "background");
  const top = PRIMITIVES[value.primitive];
  // Blend in sRGB, the way the browser does.
  const channel = (hex: string, i: number): number => Number.parseInt(hex.slice(i, i + 2), 16);
  const mix = (i: number): string =>
    Math.round(channel(top, i) * value.alpha + channel(under, i) * (1 - value.alpha))
      .toString(16)
      .padStart(2, "0");
  return `#${mix(1)}${mix(3)}${mix(5)}`.toUpperCase();
}

/** What a measured pair has to reach. `text` is WCAG AA body text; `ui` is WCAG 1.4.11 for controls and marks. */
export type ContrastFloor = "text" | "ui";
export const CONTRAST_MINIMUM: Record<ContrastFloor, number> = { text: 4.5, ui: 3 };

export interface ContrastPair {
  foreground: SemanticToken;
  background: SemanticToken;
  floor: ContrastFloor;
  /** What this pair is for, so a failure reads as a sentence. */
  use: string;
}

const text = (foreground: SemanticToken, background: SemanticToken, use: string): ContrastPair => ({
  foreground,
  background,
  floor: "text",
  use,
});
const ui = (foreground: SemanticToken, background: SemanticToken, use: string): ContrastPair => ({
  foreground,
  background,
  floor: "ui",
  use,
});

/**
 * Every pair the interface renders, checked in both themes. Muted text and status text are listed
 * against every surface they can sit on, because those are the pairs that fail most often.
 */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  text("foreground", "background", "body text on the page"),
  text("foreground", "card", "body text on a card"),
  text("foreground", "popover", "text in menus and dialogs"),
  text("foreground", "sunken", "text on a well or input"),
  text("foreground", "secondary", "text on a secondary surface"),
  text("card-foreground", "card", "card text"),
  text("popover-foreground", "popover", "popover text"),
  text("muted-foreground", "background", "secondary text on the page"),
  text("muted-foreground", "card", "secondary text on a card"),
  text("muted-foreground", "popover", "secondary text in a menu"),
  text("muted-foreground", "sunken", "placeholder and hint text in a field"),
  text("accent-foreground", "accent", "text on a selected row"),
  text("foreground", "accent", "body text on a selected row"),
  text("primary-foreground", "primary", "label on the primary button"),
  text("primary-foreground", "primary-strong", "label on the pressed primary button"),
  text("signal-foreground", "signal", "label on the mint signal"),
  ui("mark-foreground", "mark", "the beat drawn on the logo tile"),
  text("primary", "background", "link text on the page"),
  text("primary", "card", "link text on a card"),
  text("primary", "accent", "link text on a selected row"),
  text("success", "background", "success text on the page"),
  text("success", "card", "success text on a card"),
  text("success", "success-soft", "success text on its tint"),
  text("success-foreground", "success", "label on a success fill"),
  text("warning", "background", "warning text on the page"),
  text("warning", "card", "warning text on a card"),
  text("warning", "warning-soft", "warning text on its tint"),
  text("warning-foreground", "warning", "label on a warning fill"),
  text("destructive", "background", "error text on the page"),
  text("destructive", "card", "error text on a card"),
  text("destructive", "destructive-soft", "error text on its tint"),
  text("destructive-foreground", "destructive", "label on the danger button"),
  text("info", "background", "information text on the page"),
  text("info", "card", "information text on a card"),
  text("info", "info-soft", "information text on its tint"),
  text("info-foreground", "info", "label on an information fill"),
  text("rn-text", "background", "RN label on the page"),
  text("rn-text", "card", "RN label on a card"),
  text("rn-text", "rn-soft", "RN label on its tint"),
  text("rm-text", "background", "RM label on the page"),
  text("rm-text", "card", "RM label on a card"),
  text("rm-text", "rm-soft", "RM label on its tint"),
  ui("input", "background", "edge of a field on the page"),
  ui("input", "card", "edge of a field on a card"),
  ui("input", "sunken", "edge of a field on a well"),
  ui("input", "popover", "edge of a field in a dialog"),
  ui("ring", "background", "focus ring on the page"),
  ui("ring", "card", "focus ring on a card"),
  ui("ring", "popover", "focus ring in a dialog"),
  ui("primary", "card", "the primary button against its card"),
  ui("rn", "card", "RN mark on a card"),
  ui("rm", "card", "RM mark on a card"),
  ui("chart-1", "card", "chart series 1"),
  ui("chart-2", "card", "chart series 2"),
  ui("chart-3", "card", "chart series 3"),
  ui("chart-4", "card", "chart series 4"),
  ui("chart-5", "card", "chart series 5"),
];

// ---- Non-colour scales (documented in docs/design/DESIGN.md; the CSS declares the same numbers) ----

/** Spacing, 4px base. */
export const SPACING_PX = [4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128] as const;

/** Corner radii. Concentric rule: an inner radius is the outer radius minus the padding between them. */
export const RADIUS_PX = { chip: 6, control: 10, card: 14, sheet: 20 } as const;

/** Tailwind breakpoints, unchanged. */
export const BREAKPOINTS_PX = { sm: 640, md: 768, lg: 1024, xl: 1280 } as const;

/** Content widths. */
export const CONTAINER_PX = { landing: 1240, app: 1200, reading: 720 } as const;

/** Type scale (ratio 1.25 from 16px, rounded to whole px). The hero uses a fluid clamp instead. */
export const TYPE_SCALE_PX = [12, 14, 16, 18, 20, 24, 30, 38, 48] as const;

/** Motion. Durations in ms; easing curves match `--ease-out` and `--ease-in-out` in the stylesheet. */
export const MOTION = {
  pressMs: 120,
  popoverMs: 180,
  sheetMs: 240,
  heroMaxMs: 800,
  staggerMs: 60,
  easeOut: "cubic-bezier(0.23, 1, 0.32, 1)",
  easeInOut: "cubic-bezier(0.77, 0, 0.175, 1)",
} as const;

/** Minimum touch target on coarse pointers, in px. */
export const TOUCH_TARGET_PX = 44;
