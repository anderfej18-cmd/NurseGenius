import { Link } from "@tanstack/react-router";
import { Container } from "@/components/landing/Container";
import { PulseTrace } from "@/components/landing/PulseTrace";
import { Reveal } from "@/components/landing/Reveal";
import { Button } from "@/components/ui/button";
import { FINAL_CTA, FOOTER } from "@/lib/landing-content";

/** The last ask, in the brand's own colour: one filled action, one quiet one. */
export function FinalCta({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="py-16 md:py-24">
      <Container>
        <Reveal>
          <div className="relative isolate overflow-hidden rounded-xl bg-primary px-6 py-12 text-primary-foreground md:px-14 md:py-20">
            <PulseTrace className="absolute inset-x-0 bottom-0 -z-10 h-24 text-signal opacity-40" />
            <h2 className="measure text-4xl font-bold md:text-5xl">{FINAL_CTA.title}</h2>
            <p className="measure mt-4 text-base text-primary-foreground/85 md:text-lg">
              {FINAL_CTA.body}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {signedIn ? (
                <Button
                  asChild
                  size="lg"
                  className="bg-signal text-signal-foreground hover:bg-signal/90"
                >
                  <Link to="/dashboard">{FOOTER.dashboard}</Link>
                </Button>
              ) : (
                <>
                  <Button
                    asChild
                    size="lg"
                    className="bg-signal text-signal-foreground hover:bg-signal/90"
                  >
                    <Link to="/auth" search={{ mode: "signup" }}>
                      {FINAL_CTA.primary}
                    </Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="ghost"
                    className="text-primary-foreground hover:bg-primary-strong hover:text-primary-foreground"
                  >
                    <Link to="/auth">{FINAL_CTA.secondary}</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
