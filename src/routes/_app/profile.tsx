import { Link, createFileRoute } from "@tanstack/react-router";
import { Section } from "@/components/app/Section";
import { SignedInPage } from "@/components/SignedInPage";
import { ThemeControl } from "@/components/ThemeControl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TIER_DAILY_LIMIT, TIER_LABEL, TIER_SESSION_LIMIT, useAuth } from "@/hooks/use-auth";
import { profileFacts, type ProfileFact } from "@/lib/profile-view";

export const Route = createFileRoute("/_app/profile")({
  component: Profile,
  head: () => ({
    meta: [
      { title: "Profile | NurseGenius" },
      { name: "description", content: "Your details, exam date and plan." },
    ],
  }),
});

function Facts({ facts }: { facts: readonly ProfileFact[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-[max-content_1fr]">
      {facts.map((fact) => (
        <div key={fact.label} className="flex flex-col gap-0.5 sm:contents">
          <dt className="text-muted-foreground">{fact.label}</dt>
          <dd className="min-w-0 break-words font-medium">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ProfileDetails() {
  const { profile } = useAuth();
  if (!profile) return null;
  const facts = profileFacts(
    profile,
    new Date(),
    TIER_DAILY_LIMIT[profile.tier],
    TIER_SESSION_LIMIT[profile.tier],
  );
  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Your details"
        description="Your name and username were set when you joined. To change your exam date, use the Study Plan page."
        actions={<Badge variant="secondary">{TIER_LABEL[profile.tier]}</Badge>}
      >
        <Facts facts={facts.details} />
        <div>
          <Button asChild size="sm" variant="outline">
            <Link to="/plan">Change exam date</Link>
          </Button>
        </div>
      </Section>

      <Section title="Your plan">
        <Facts facts={facts.plan} />
        <div>
          <Button asChild size="sm">
            <Link to="/payments">See plans and payments</Link>
          </Button>
        </div>
      </Section>

      <Section
        title="Appearance"
        description="Light, dark, or follow this device. It applies inside your account and is saved on this device only."
      >
        <div>
          <ThemeControl />
        </div>
      </Section>
    </div>
  );
}

function Profile() {
  return (
    <SignedInPage title="Profile" description="Your details, exam date and plan.">
      {() => <ProfileDetails />}
    </SignedInPage>
  );
}
