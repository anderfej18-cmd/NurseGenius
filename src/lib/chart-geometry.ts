// The arithmetic behind the charts, kept apart from the drawing so it can be tested. A chart here is
// always one series on one axis: scores from 0 to 100 over a run of finished tests.

export interface TrendPoint {
  /** What the reader sees in the tooltip and the table: usually the date and the test. */
  readonly label: string;
  /** A value from 0 to 100. */
  readonly value: number;
}

export interface Padding {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface Plot {
  readonly width: number;
  readonly height: number;
  readonly padding: Padding;
}

/** The x position of point `index` out of `count`, spread evenly across the plot. */
export function xAt(plot: Plot, index: number, count: number): number {
  const inner = plot.width - plot.padding.left - plot.padding.right;
  if (count <= 1) return plot.padding.left + inner / 2;
  return plot.padding.left + (inner * index) / (count - 1);
}

/** The y position of a value on a 0 to `max` axis (the baseline is at the bottom). */
export function yAt(plot: Plot, value: number, max = 100): number {
  const inner = plot.height - plot.padding.top - plot.padding.bottom;
  const clamped = Math.min(max, Math.max(0, value));
  return plot.padding.top + inner * (1 - clamped / max);
}

/** The index of the point closest to a pointer x, so the reader aims at a date, not at a line. */
export function nearestIndex(plot: Plot, pointerX: number, count: number): number {
  if (count <= 1) return 0;
  const inner = plot.width - plot.padding.left - plot.padding.right;
  const ratio = (pointerX - plot.padding.left) / inner;
  return Math.min(count - 1, Math.max(0, Math.round(ratio * (count - 1))));
}

/** The SVG path of a polyline through the points, with no smoothing that would invent values. */
export function linePath(points: readonly { x: number; y: number }[]): string {
  return points
    .map((point, i) => `${i === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
}

/** The same line closed down to the baseline, for the faint area wash under it. */
export function areaPath(points: readonly { x: number; y: number }[], baseline: number): string {
  if (points.length === 0) return "";
  const first = points[0];
  const last = points[points.length - 1];
  return `${linePath(points)} L${last.x.toFixed(1)} ${baseline.toFixed(1)} L${first.x.toFixed(1)} ${baseline.toFixed(1)} Z`;
}

/** Gridline values for a 0 to 100 axis: clean numbers, few enough to stay quiet. */
export function percentTicks(height: number): number[] {
  return height < 160 ? [0, 50, 100] : [0, 25, 50, 75, 100];
}
