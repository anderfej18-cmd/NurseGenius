import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { PageHeader } from "@/components/app/PageHeader";
import {
  AllowanceTile,
  LevelTile,
  ReadinessTile,
  RecentTests,
  StreakTile,
  TodayCard,
  TopicFocus,
} from "@/components/dashboard/DashboardSections";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { TIER_DAILY_LIMIT, TIER_LABEL } from "@/lib/exam-rules";
import { greetingTitle } from "@/lib/dashboard-view";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Dashboard | NurseGenius" },
      {
        name: "description",
        content:
          "Review your nursing practice progress, daily question use, and recent test results.",
      },
      { property: "og:title", content: "Dashboard | NurseGenius" },
      {
        property: "og:description",
        content: "Your nursing practice progress, daily question use, and recent test results.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

/** How many recent tests the dashboard charts and averages. */
const RECENT_TESTS = 10;

function Dashboard() {
  const { user, profile, refresh } = useAuth();

  // Keep the daily question counter live: realtime profile updates, plus a refresh on focus and on a timer.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`profile-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
        () => {
          refresh();
        },
      )
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const interval = window.setInterval(() => {
      refresh();
    }, 30000);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (!profile)
    return (
      <div className="mx-auto w-full max-w-6xl" aria-busy="true">
        <PageHeader title="Dashboard" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      </div>
    );

  const dailyLimit = TIER_DAILY_LIMIT[profile.tier];
  const today = new Date().toISOString().slice(0, 10);
  const usedToday = profile.last_question_date === today ? profile.questions_today : 0;
  const programme = profile.exam_preference === "RM" ? "RM" : "RN";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title={greetingTitle(profile.username || profile.first_name)}
        description={`${TIER_LABEL[profile.tier]} plan${
          profile.expiry_date
            ? `, until ${new Date(profile.expiry_date).toLocaleDateString("en-GB", { dateStyle: "medium" })}`
            : ""
        }.`}
        actions={
          <Button asChild size="lg">
            <Link to="/exam/start">Take a test</Link>
          </Button>
        }
      />

      <TodayCard />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AllowanceTile used={usedToday} limit={dailyLimit} />
        <StreakTile />
        <ReadinessTile examType={programme} />
        <LevelTile />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <RecentTests recent={RECENT_TESTS} />
        <TopicFocus />
      </div>
    </div>
  );
}
