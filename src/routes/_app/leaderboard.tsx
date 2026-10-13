import { createFileRoute } from "@tanstack/react-router";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { SignedInPage } from "@/components/SignedInPage";

export const Route = createFileRoute("/_app/leaderboard")({
  component: Leaderboard,
  head: () => ({
    meta: [
      { title: "Leaderboard | NurseGenius" },
      {
        name: "description",
        content: "See today's rankings from NurseGenius nursing exam practice.",
      },
      { property: "og:title", content: "Leaderboard | NurseGenius" },
      {
        property: "og:description",
        content: "Today's rankings from NurseGenius nursing exam practice.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function Leaderboard() {
  return (
    <SignedInPage
      title="Daily Leaderboard"
      description="Live rankings. You need at least 100 questions attempted today to qualify. The board updates as students submit and resets at 00:00 UTC."
    >
      {() => <LeaderboardTable period="daily" liveShuffle />}
    </SignedInPage>
  );
}
