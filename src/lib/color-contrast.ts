// WCAG 2 contrast maths on #RRGGBB values. Pure functions: the design-token tests use them to measure
// every foreground/background pair the interface renders, in both themes.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parse "#RRGGBB" into 0-255 channels. */
export function parseHex(hex: string): Rgb {
  const match = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex.trim());
  if (!match) throw new Error(`Not a #RRGGBB colour: ${hex}`);
  return {
    r: Number.parseInt(match[1], 16),
    g: Number.parseInt(match[2], 16),
    b: Number.parseInt(match[3], 16),
  };
}

const channel = (value: number): number => {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** Relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2 contrast ratio between two opaque colours, 1 to 21. */
export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const [lighter, darker] = a >= b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

/** Composite a colour with alpha over an opaque backdrop, giving the colour the eye sees. */
export function overBackdrop(foreground: string, alpha: number, backdrop: string): string {
  const f = parseHex(foreground);
  const b = parseHex(backdrop);
  const mix = (top: number, bottom: number): string =>
    Math.round(top * alpha + bottom * (1 - alpha))
      .toString(16)
      .padStart(2, "0");
  return `#${mix(f.r, b.r)}${mix(f.g, b.g)}${mix(f.b, b.b)}`.toUpperCase();
}
