import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AiHelp } from "@/components/landing/AiHelp";
import { Faq } from "@/components/landing/Faq";
import { FinalCta } from "@/components/landing/FinalCta";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingNav } from "@/components/landing/LandingNav";
import { Mastery } from "@/components/landing/Mastery";
import { Pathways } from "@/components/landing/Pathways";
import { PlansTable } from "@/components/landing/PlansTable";
import { Practice } from "@/components/landing/Practice";
import { StudyPlan } from "@/components/landing/StudyPlan";
import { useAuth } from "@/hooks/use-auth";
import { resolveToken } from "@/lib/design-tokens";

const TITLE = "NurseGenius: RN and RM exam practice with a study plan";
const DESCRIPTION =
  "Timed RN and RM practice with the reasoning behind every answer, a mistake bank, and a study plan built from your own results.";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "theme-color", content: resolveToken("light", "background") },
    ],
  }),
});

function Index() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  // A signed-in person who has not finished setting up goes on to finish it.
  useEffect(() => {
    if (!loading && user && profile && !profile.onboarded) navigate({ to: "/onboarding" });
  }, [loading, user, profile, navigate]);

  const signedIn = !!user;

  return (
    // The landing page is always light: `theme-fixed` pins the light tokens whatever the visitor's
    // own theme preference is.
    <div className="theme-fixed min-h-dvh bg-background text-foreground">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <LandingNav signedIn={signedIn} />
      <main id="main">
        <Hero signedIn={signedIn} />
        <HowItWorks />
        <Pathways />
        <Practice />
        <Mastery />
        <AiHelp />
        <StudyPlan />
        <PlansTable />
        <Faq />
        <FinalCta signedIn={signedIn} />
      </main>
      <LandingFooter signedIn={signedIn} />
    </div>
  );
}
