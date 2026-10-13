import { Link } from "@tanstack/react-router";
import { BrandMark } from "@/components/landing/PulseTrace";
import { Button } from "@/components/ui/button";
import { SITE_NAME } from "@/lib/landing-content";

/** A slim header for public pages that are not the landing page (a shared test opened from a link). */
export function PublicHeader() {
  return (
    <header className="border-b border-divider bg-background">
      <div className="mx-auto flex h-16 w-full max-w-[1240px] items-center justify-between gap-4 gutter">
        <Link
          to="/"
          className="flex items-center gap-2.5 rounded-md"
          aria-label={`${SITE_NAME} home`}
        >
          <BrandMark />
          <span className="font-display text-lg font-semibold tracking-tight">{SITE_NAME}</span>
        </Link>
        <Button asChild variant="outline">
          <Link to="/auth">Sign in</Link>
        </Button>
      </div>
    </header>
  );
}
