import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/AppHeader";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { Trophy } from "lucide-react";

export const Route = createFileRoute("/leaderboard")({ component: Leaderboard, head: () => ({ meta: [
  { title: "Nursing Practice Leaderboard — NurseGenius" }, { name: "description", content: "See daily and weekly rankings from NurseGenius nursing exam practice." },
  { property: "og:title", content: "Nursing Practice Leaderboard — NurseGenius" }, { property: "og:description", content: "Daily and weekly rankings from NurseGenius nursing exam practice." },
  { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
] }) });

function Leaderboard() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  if (!profile) return <><AppHeader /><div className="p-12 text-center">Loading…</div></>;

  return (
    <>
      <AppHeader />
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Trophy className="text-warning" /> Daily Leaderboard
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Live rankings — minimum 100 questions attempted today to qualify. Updates in real time as users submit. Resets at 00:00 UTC.
        </p>
        <div className="mt-6">
          <LeaderboardTable rpc="get_daily_leaderboard" currentUserId={user?.id} liveShuffle />
        </div>
      </main>
    </>
  );
}
