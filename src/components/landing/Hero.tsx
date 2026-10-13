import { Link } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { Container } from "@/components/landing/Container";
import { PulseTrace } from "@/components/landing/PulseTrace";
import { TestPreview } from "@/components/landing/TestPreview";
import { Button } from "@/components/ui/button";
import { FOOTER, HERO } from "@/lib/landing-content";

const order = (position: number): CSSProperties => ({ "--i": position }) as CSSProperties;

/**
 * The first screen: a thesis in two lines, one primary action and one secondary, and the layout of a
 * test beside them. The chart grid and the pulse trace are the page's signature; the pieces rise in
 * 60ms apart, once.
 */
export function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="relative isolate overflow-hidden">
      <div aria-hidden="true" className="chart-grid absolute inset-0 -z-10" />
      <Container className="grid grid-cols-1 gap-12 pb-24 pt-12 md:pt-20 lg:grid-cols-12 lg:items-center lg:gap-10 lg:pb-32 lg:pt-24">
        <div className="lg:col-span-7">
          <h1 className="hero-in text-hero font-bold" style={order(0)}>
            {HERO.headline}
          </h1>
          <p
            className="hero-in measure mt-6 text-lg text-muted-foreground md:text-xl"
            style={order(1)}
          >
            {HERO.description}
          </p>
          <div className="hero-in mt-8 flex flex-wrap items-center gap-3" style={order(2)}>
            {signedIn ? (
              <Button asChild size="lg">
                <Link to="/dashboard">{FOOTER.dashboard}</Link>
              </Button>
            ) : (
              <Button asChild size="lg">
                <Link to="/auth" search={{ mode: "signup" }}>
                  {HERO.primaryCta}
                </Link>
              </Button>
            )}
            <Button asChild size="lg" variant="outline">
              <a href="#how-it-works">{HERO.secondaryCta}</a>
            </Button>
          </div>
          <p className="hero-in mt-4 text-sm text-muted-foreground" style={order(3)}>
            {HERO.note}
          </p>
        </div>

        <div className="hero-in lg:col-span-5" style={order(4)}>
          <TestPreview caption={HERO.previewCaption} />
        </div>
      </Container>
      <PulseTrace className="absolute inset-x-0 bottom-0 -z-10 h-20 opacity-70 lg:h-24" />
    </section>
  );
}
