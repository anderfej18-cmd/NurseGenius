import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/app/AppShell";
import { useAuth } from "@/hooks/use-auth";

// The layout every signed-in student and admin page shares (a pathless route: addresses are unchanged).
// It sends a visitor who is signed out to /auth and a student who has not finished setting up to
// /onboarding (an admin may open the admin tools without onboarding), then draws the navigation once
// for all of them. The server still checks every request: this is only where the screen decides.
export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, profile, loading, isAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/auth" });
    else if (profile && !profile.onboarded && !isAdmin) navigate({ to: "/onboarding" });
  }, [loading, user, profile, isAdmin, navigate]);

  // A visitor who is signed out sees nothing while being sent to the sign-in page.
  if (!loading && !user) return null;

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
