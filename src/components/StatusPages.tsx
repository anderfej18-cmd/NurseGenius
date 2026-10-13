import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BrandMark, PulseTrace } from "@/components/landing/PulseTrace";
import { Button } from "@/components/ui/button";
import { SITE_NAME } from "@/lib/landing-content";

/** A full-page notice on the fixed light theme: the brand, a plain explanation and the way out. */
function StatusPage({
  heading,
  children,
  actions,
}: {
  heading: string;
  children: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className="theme-fixed relative isolate flex min-h-dvh flex-col overflow-hidden bg-background text-foreground">
      <div aria-hidden="true" className="chart-grid absolute inset-0 -z-10" />
      <header className="flex h-16 items-center gutter">
        <Link
          to="/"
          className="flex items-center gap-2.5 rounded-md"
          aria-label={`${SITE_NAME} home`}
        >
          <BrandMark />
          <span className="font-display text-lg font-semibold tracking-tight">{SITE_NAME}</span>
        </Link>
      </header>
      <main id="main" className="flex flex-1 items-center gutter">
        <div className="mx-auto w-full max-w-xl py-12">
          <h1 className="text-4xl font-bold md:text-5xl">{heading}</h1>
          <div className="mt-4 text-base text-muted-foreground md:text-lg">{children}</div>
          <div className="mt-8 flex flex-wrap gap-3">{actions}</div>
        </div>
      </main>
      <PulseTrace className="h-16 opacity-60" />
    </div>
  );
}

/** Shown for an address that matches no page. */
export function NotFoundPage() {
  return (
    <StatusPage
      heading="This page does not exist"
      actions={
        <>
          <Button asChild size="lg">
            <Link to="/">Go to the home page</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/dashboard">Go to your dashboard</Link>
          </Button>
        </>
      }
    >
      <p>The address may have a typing mistake, or the page may have moved.</p>
    </StatusPage>
  );
}

/** Shown when a page fails to load. The message is already safe text; nothing technical is shown. */
export function RouteErrorPage({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <StatusPage
      heading="This page could not load"
      actions={
        <>
          <Button size="lg" onClick={onRetry}>
            Try again
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/">Go to the home page</Link>
          </Button>
        </>
      }
    >
      <p role="alert">{message}</p>
    </StatusPage>
  );
}
