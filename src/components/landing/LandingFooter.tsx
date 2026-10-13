import { Link } from "@tanstack/react-router";
import { Container } from "@/components/landing/Container";
import { BrandMark } from "@/components/landing/PulseTrace";
import { FOOTER, FOOTER_LINKS, SITE_NAME } from "@/lib/landing-content";

/** Every link goes somewhere real: a section of this page, or the sign-in and sign-up forms. */
export function LandingFooter({ signedIn }: { signedIn: boolean }) {
  return (
    <footer className="border-t border-divider bg-card">
      <Container className="grid grid-cols-1 gap-10 py-12 md:grid-cols-12 md:py-16">
        <div className="md:col-span-5">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <span className="font-display text-lg font-semibold tracking-tight">{SITE_NAME}</span>
          </div>
          <p className="mt-4 max-w-xs text-sm text-muted-foreground">{FOOTER.tagline}</p>
        </div>

        <nav aria-label="Explore" className="md:col-span-4">
          <h2 className="font-sans text-sm font-semibold tracking-normal text-foreground">
            {FOOTER.columns.explore}
          </h2>
          <ul className="mt-4 flex flex-col gap-2.5">
            {FOOTER_LINKS.map((link) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  className="rounded-sm text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Account" className="md:col-span-3">
          <h2 className="font-sans text-sm font-semibold tracking-normal text-foreground">
            {FOOTER.columns.account}
          </h2>
          <ul className="mt-4 flex flex-col gap-2.5">
            {signedIn ? (
              <li>
                <Link
                  to="/dashboard"
                  className="rounded-sm text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
                >
                  {FOOTER.dashboard}
                </Link>
              </li>
            ) : (
              <>
                <li>
                  <Link
                    to="/auth"
                    className="rounded-sm text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
                  >
                    {FOOTER.signIn}
                  </Link>
                </li>
                <li>
                  <Link
                    to="/auth"
                    search={{ mode: "signup" }}
                    className="rounded-sm text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
                  >
                    {FOOTER.create}
                  </Link>
                </li>
              </>
            )}
          </ul>
        </nav>
      </Container>
      <div className="border-t border-divider">
        <Container className="py-5">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {SITE_NAME}
          </p>
        </Container>
      </div>
    </footer>
  );
}
