import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  areaPath,
  linePath,
  nearestIndex,
  percentTicks,
  type TrendPoint,
  xAt,
  yAt,
  type Plot,
} from "@/lib/chart-geometry";
import { cn } from "@/lib/utils";

const HEIGHT = 200;
const PADDING = { top: 14, right: 16, bottom: 28, left: 36 } as const;

/**
 * One series over time, on one 0 to 100 axis: a 2px line, a faint wash, hairline solid gridlines, the
 * latest value labelled at the end of the line, and a crosshair that snaps to the nearest point. The
 * tooltip enhances; every value is also in the table view, and arrow keys move the crosshair.
 * Colour is the first chart token on a card; the unit and the title say what is plotted, so there is
 * no legend for a single series.
 */
export function TrendChart({
  points,
  title,
  firstAxisLabel,
  lastAxisLabel,
}: {
  points: readonly TrendPoint[];
  title: string;
  firstAxisLabel: string;
  lastAxisLabel: string;
}) {
  const [asTable, setAsTable] = useState(false);
  const tableId = useId();
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{title}</span>
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={asTable}
          aria-controls={tableId}
          onClick={() => setAsTable((on) => !on)}
        >
          {asTable ? "Show chart" : "Show table"}
        </Button>
      </figcaption>
      <div id={tableId}>
        {asTable ? (
          <table className="w-full text-sm">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="text-left text-muted-foreground">
                <th scope="col" className="py-1 font-medium">
                  Test
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Score
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((point, index) => (
                <tr key={`${point.label}-${index}`} className="border-t border-divider">
                  <td className="py-1.5">{point.label}</td>
                  <td className="py-1.5 text-right tabular-nums">{point.value.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Plotted
            points={points}
            title={title}
            firstAxisLabel={firstAxisLabel}
            lastAxisLabel={lastAxisLabel}
          />
        )}
      </div>
    </figure>
  );
}

function Plotted({
  points,
  title,
  firstAxisLabel,
  lastAxisLabel,
}: {
  points: readonly TrendPoint[];
  title: string;
  firstAxisLabel: string;
  lastAxisLabel: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => setWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const plot: Plot = { width: Math.max(width, 200), height: HEIGHT, padding: PADDING };
  const coordinates = points.map((point, index) => ({
    x: xAt(plot, index, points.length),
    y: yAt(plot, point.value),
  }));
  const baseline = HEIGHT - PADDING.bottom;
  const last = coordinates[coordinates.length - 1];
  const shown = active === null ? null : points[active];
  const shownAt = active === null ? null : coordinates[active];

  const move = (event: React.PointerEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setActive(nearestIndex(plot, event.clientX - rect.left, points.length));
  };
  const key = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowLeft") setActive((i) => Math.max(0, (i ?? points.length) - 1));
    else if (event.key === "ArrowRight")
      setActive((i) => Math.min(points.length - 1, (i ?? -1) + 1));
    else if (event.key === "Escape") setActive(null);
    else return;
    event.preventDefault();
  };

  return (
    <div ref={box} className="relative w-full" style={{ height: HEIGHT }}>
      {width > 0 && (
        <svg
          width={plot.width}
          height={HEIGHT}
          role="img"
          aria-label={`${title}. Latest ${points[points.length - 1]?.value.toFixed(1)} percent. Use the table for every value.`}
          tabIndex={0}
          className="focus-ring touch-pan-y rounded-sm"
          onPointerMove={move}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive((i) => i ?? points.length - 1)}
          onBlur={() => setActive(null)}
          onKeyDown={key}
        >
          {percentTicks(HEIGHT).map((tick) => (
            <g key={tick}>
              <line
                x1={PADDING.left}
                x2={plot.width - PADDING.right}
                y1={yAt(plot, tick)}
                y2={yAt(plot, tick)}
                className="stroke-divider"
                strokeWidth={1}
              />
              <text
                x={PADDING.left - 8}
                y={yAt(plot, tick) + 4}
                textAnchor="end"
                className="fill-muted-foreground text-[11px] tabular-nums"
              >
                {tick}
              </text>
            </g>
          ))}
          <path d={areaPath(coordinates, baseline)} className="fill-chart-1" fillOpacity={0.1} />
          <path
            d={linePath(coordinates)}
            fill="none"
            className="stroke-chart-1"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {shownAt && (
            <line
              x1={shownAt.x}
              x2={shownAt.x}
              y1={PADDING.top}
              y2={baseline}
              className="stroke-border"
              strokeWidth={1}
            />
          )}
          {last && (
            <circle
              cx={(shownAt ?? last).x}
              cy={(shownAt ?? last).y}
              r={4}
              className="fill-chart-1 stroke-card"
              strokeWidth={2}
            />
          )}
          <text x={PADDING.left} y={HEIGHT - 6} className="fill-muted-foreground text-[11px]">
            {firstAxisLabel}
          </text>
          <text
            x={plot.width - PADDING.right}
            y={HEIGHT - 6}
            textAnchor="end"
            className="fill-muted-foreground text-[11px]"
          >
            {lastAxisLabel}
          </text>
        </svg>
      )}
      {shown && shownAt && (
        <div
          role="status"
          className={cn(
            "pointer-events-none absolute top-0 z-10 rounded-md border bg-popover px-2.5 py-1.5 text-popover-foreground shadow-md",
            shownAt.x > plot.width / 2 ? "-translate-x-full" : "",
          )}
          style={{ left: shownAt.x + (shownAt.x > plot.width / 2 ? -10 : 10) }}
        >
          <p className="text-base font-semibold tabular-nums">{shown.value.toFixed(1)}%</p>
          <p className="text-xs text-muted-foreground">{shown.label}</p>
        </div>
      )}
    </div>
  );
}
