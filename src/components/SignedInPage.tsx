import { useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/hooks/use-auth";

interface Props {
  title: string;
  description?: string;
  children: (userId: string) => ReactNode;
}

/** The frame every signed-in student screen shares: header, sign-in redirect, title, centred column. */
export function SignedInPage({ title, description, children }: Props) {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
    else if (!loading && user && profile && !profile.onboarded) navigate({ to: "/onboarding" });
  }, [loading, user, profile, navigate]);

  return (
    <>
      <AppHeader />
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <h1 className="text-3xl font-bold">{title}</h1>
        {description && <p className="text-muted-foreground text-sm mt-1">{description}</p>}
        <div className="mt-6 space-y-4">
          {user && profile ? (
            children(user.id)
          ) : (
            <p className="p-12 text-center text-muted-foreground">Loading…</p>
          )}
        </div>
      </main>
    </>
  );
}
