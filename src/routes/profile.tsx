import { Link, createFileRoute } from "@tanstack/react-router";
import { SignedInPage } from "@/components/SignedInPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TIER_DAILY_LIMIT, TIER_LABEL, TIER_SESSION_LIMIT, useAuth } from "@/hooks/use-auth";
import { profileFacts } from "@/lib/profile-view";

export const Route = createFileRoute("/profile")({
  component: Profile,
  head: () => ({
    meta: [
      { title: "Profile — NurseGenius" },
      { name: "description", content: "Your details, exam date and plan." },
    ],
  }),
});

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
    <>
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Your details</h2>
          <Badge variant="secondary">{TIER_LABEL[profile.tier]}</Badge>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          {facts.details.map((fact) => (
            <div key={fact.label} className="contents">
              <dt className="text-muted-foreground">{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          Your name and username were set when you joined. To change your exam date, use the Study
          Plan page.
        </p>
        <Button asChild size="sm" variant="outline">
          <Link to="/plan">Change exam date</Link>
        </Button>
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="font-semibold">Your plan</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          {facts.plan.map((fact) => (
            <div key={fact.label} className="contents">
              <dt className="text-muted-foreground">{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
        <Button asChild size="sm" className="bg-hero">
          <Link to="/payments">See plans and payments</Link>
        </Button>
      </Card>
    </>
  );
}

function Profile() {
  return (
    <SignedInPage title="Profile" description="Your details, exam date and plan.">
      {() => <ProfileDetails />}
    </SignedInPage>
  );
}
