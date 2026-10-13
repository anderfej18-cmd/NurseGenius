import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BrandMark, PulseTrace } from "@/components/landing/PulseTrace";
import { SITE_NAME } from "@/lib/landing-content";
import { cn } from "@/lib/utils";

interface AuthShellProps {
  /** The page's one h1. */
  title: string;
  description?: ReactNode;
  /** Short, true statements for the side panel (wide screens only). */
  points: readonly string[];
  /** The side panel's heading. */
  panelTitle: string;
  children: ReactNode;
  className?: string;
}

/**
 * The frame for sign in, sign up and first-run setup. Public pages are always light (`theme-fixed`).
 * A wide screen gets a brand panel beside the form; a phone gets the form alone, under a slim header.
 */
export function AuthShell({
  title,
  description,
  points,
  panelTitle,
  children,
  className,
}: AuthShellProps) {
  return (
    <div className="theme-fixed min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      <aside className="relative isolate hidden overflow-hidden border-r border-divider bg-card lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden="true" className="chart-grid absolute inset-0 -z-10" />
        <Link
          to="/"
          className="flex w-fit items-center gap-2.5 rounded-md"
          aria-label={`${SITE_NAME} home`}
        >
          <BrandMark />
          <span className="font-display text-lg font-semibold tracking-tight">{SITE_NAME}</span>
        </Link>
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold">{panelTitle}</h2>
          <ul className="mt-6 flex flex-col gap-3">
            {points.map((point) => (
              <li key={point} className="flex gap-3 text-base text-muted-foreground">
                <span aria-hidden="true" className="mt-2.5 h-px w-4 shrink-0 bg-primary" />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <PulseTrace className="h-16 opacity-70" />
      </aside>

      <div className="flex min-h-dvh flex-col">
        <header className="flex h-16 items-center px-5 sm:px-8 lg:hidden">
          <Link
            to="/"
            className="flex items-center gap-2.5 rounded-md"
            aria-label={`${SITE_NAME} home`}
          >
            <BrandMark />
            <span className="font-display text-lg font-semibold tracking-tight">{SITE_NAME}</span>
          </Link>
        </header>
        <main
          id="main"
          className={cn(
            "mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 pb-12 pt-4 sm:px-8 lg:py-12",
            className,
          )}
        >
          <h1 className="text-3xl font-bold">{title}</h1>
          {description && (
            <p className="mt-2 text-sm text-muted-foreground md:text-base">{description}</p>
          )}
          <div className="mt-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
