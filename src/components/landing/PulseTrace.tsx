import { cn } from "@/lib/utils";

// One heartbeat, twice, along a flat line: the product's signature mark. The stroke keeps its width
// however the box is stretched, and the draw-on is a clip reveal in styles.css (no measuring).
const TRACE_PATH =
  "M0 70 H240 q14 -14 28 0 H300 l10 10 l16 -62 l16 78 l10 -26 H420 q22 -26 44 0 H780 q14 -14 28 0 H820 l10 10 l16 -62 l16 78 l10 -26 H940 q22 -26 44 0 H1200";

/** The full-width trace. Decorative; it draws itself once on load unless motion is reduced. */
export function PulseTrace({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 1200 120"
      preserveAspectRatio="none"
      className={cn("pulse-trace pointer-events-none block h-20 w-full text-primary", className)}
    >
      <path
        d={TRACE_PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** The wordmark's tile: evergreen with a single mint beat, the same in light and dark. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-md bg-mark",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none">
        <path
          d="M2 13 H7 L9.5 6 L13 19 L15.5 11 H22"
          stroke="var(--mark-foreground)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
