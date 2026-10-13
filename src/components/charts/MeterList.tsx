import type { ReactNode } from "react";

export interface MeterRow {
  readonly key: string;
  readonly label: string;
  /** From 0 to 100. */
  readonly value: number;
  /** The figure at the tip of the bar, as the reader should see it ("62"). */
  readonly valueText: string;
  /** A short second line: what the figure rests on. */
  readonly note?: ReactNode;
  /** The reading in words, shown beside the label so colour is never the only signal. */
  readonly status?: ReactNode;
}

/**
 * A list of single-series bars on one 0 to 100 axis, the value at the tip of each, in order. Bars are
 * thin, square at the baseline and rounded at the data end, one colour for a nominal list; the
 * unfilled track is a lighter step of the same ramp. The words carry the reading, not the colour.
 */
export function MeterList({ rows, label }: { rows: readonly MeterRow[]; label: string }) {
  return (
    <ul aria-label={label} className="flex flex-col gap-4">
      {rows.map((row) => (
        <li key={row.key} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-sm font-medium">{row.label}</span>
            {row.status && (
              <span className="shrink-0 text-xs text-muted-foreground">{row.status}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div
              role="meter"
              aria-label={`${row.label}: ${row.valueText} out of 100`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(row.value)}
              className="h-2 flex-1 overflow-hidden rounded-r-full bg-muted"
            >
              <div
                className="h-full origin-left rounded-r-full bg-chart-1 transition-transform duration-500 ease-out"
                style={{ transform: `scaleX(${Math.min(100, Math.max(0, row.value)) / 100})` }}
              />
            </div>
            <span className="w-9 shrink-0 text-right text-sm font-semibold tabular-nums">
              {row.valueText}
            </span>
          </div>
          {row.note && <p className="text-xs text-muted-foreground">{row.note}</p>}
        </li>
      ))}
    </ul>
  );
}
