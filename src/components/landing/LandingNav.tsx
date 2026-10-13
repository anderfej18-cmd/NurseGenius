import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useState } from "react";
import { BrandMark } from "@/components/landing/PulseTrace";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { FOOTER, HERO, NAV_LINKS, SITE_NAME } from "@/lib/landing-content";

/** One line, 64px high. Five section links, then the account actions; below 1024px the links move into a sheet. */
export function LandingNav({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-divider bg-background">
      <div className="mx-auto flex h-16 w-full max-w-[1240px] items-center justify-between gap-4 gutter">
        <Link
          to="/"
          className="flex items-center gap-2.5 rounded-md"
          aria-label={`${SITE_NAME} home`}
        >
          <BrandMark />
          {/* On the narrowest phones the mark alone stands for the name so the actions fit on one line. */}
          <span className="hidden font-display text-lg font-semibold tracking-tight min-[360px]:inline">
            {SITE_NAME}
          </span>
        </Link>

        <nav aria-label="Sections" className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {signedIn ? (
            <Button asChild>
              <Link to="/dashboard">{FOOTER.dashboard}</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" className="hidden sm:inline-flex">
                <Link to="/auth">{FOOTER.signIn}</Link>
              </Button>
              <Button asChild>
                <Link to="/auth" search={{ mode: "signup" }}>
                  {HERO.primaryCta}
                </Link>
              </Button>
            </>
          )}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(20rem,88vw)]">
              <SheetHeader>
                <SheetTitle>{SITE_NAME}</SheetTitle>
                <SheetDescription>Jump to a section.</SheetDescription>
              </SheetHeader>
              <nav aria-label="Sections (menu)" className="mt-6 flex flex-col gap-1">
                {NAV_LINKS.map((link) => (
                  <SheetClose key={link.href} asChild>
                    <a
                      href={link.href}
                      className="rounded-md px-3 py-3 text-base font-medium text-foreground hover:bg-accent hover:text-accent-foreground"
                    >
                      {link.label}
                    </a>
                  </SheetClose>
                ))}
              </nav>
              {!signedIn && (
                <div className="mt-6 flex flex-col gap-2 border-t border-divider pt-6">
                  <SheetClose asChild>
                    <Button asChild variant="outline">
                      <Link to="/auth">{FOOTER.signIn}</Link>
                    </Button>
                  </SheetClose>
                </div>
              )}
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
