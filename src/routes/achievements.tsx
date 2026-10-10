import { createFileRoute } from "@tanstack/react-router";
import { AchievementsPanel } from "@/components/progress/AchievementsPanel";
import { SignedInPage } from "@/components/SignedInPage";

export const Route = createFileRoute("/achievements")({
  component: Achievements,
  head: () => ({
    meta: [
      { title: "Achievements — NurseGenius" },
      { name: "description", content: "Your level, XP and achievements." },
    ],
  }),
});

function Achievements() {
  return (
    <SignedInPage
      title="Achievements"
      description="Your level, XP and the achievements you have earned."
    >
      {() => <AchievementsPanel />}
    </SignedInPage>
  );
}
