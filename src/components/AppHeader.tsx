import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth, TIER_LABEL } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, LogOut, Menu, X, Trophy } from "lucide-react";


export function AppHeader() {
  const { user, profile, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  const showNav = !!user && (profile?.onboarded || isAdmin);

  const link = (to: string, label: string) => (
    <Link
      key={to}
      to={to}
      onClick={() => setOpen(false)}
      className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
        path === to ? "bg-accent text-accent-foreground" : "text-foreground/70 hover:text-foreground hover:bg-accent/50"
      }`}
    >
      {label}
    </Link>
  );

  const items: Array<[string, string]> = [
    ["/dashboard", "Dashboard"],
    ["/exam/start", "Take Test"],
    ["/leaderboard", "Leaderboard"],
    ["/payments", "Upgrade"],
    ...(isAdmin ? ([["/admin", "Admin"]] as Array<[string, string]>) : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-hero shadow-glow flex items-center justify-center">
            <Brain className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg tracking-tight">NurseGenius</span>
        </Link>


        {showNav && (
          <nav className="hidden md:flex items-center gap-1">
            {items.map(([to, label]) => link(to, label))}
          </nav>
        )}

        <div className="flex items-center gap-2">
          {user ? (
            <>
              {profile && (
                <Badge variant="secondary" className="hidden sm:inline-flex">
                  {TIER_LABEL[profile.tier]}
                </Badge>
              )}
              {showNav && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="md:hidden"
                  aria-label="Leaderboard"
                  onClick={() => navigate({ to: "/leaderboard" })}
                >
                  <Trophy className="h-4 w-4" />
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => { await signOut(); navigate({ to: "/" }); }}
              >
                <LogOut className="h-4 w-4" />
              </Button>
              {showNav && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="md:hidden"
                  aria-label="Menu"
                  onClick={() => setOpen((v) => !v)}
                >
                  {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                </Button>
              )}
            </>
          ) : (
            <Button size="sm" onClick={() => navigate({ to: "/auth" })}>Sign In</Button>
          )}
        </div>
      </div>

      {showNav && open && (
        <nav className="md:hidden border-t bg-background/95 backdrop-blur-md">
          <div className="container mx-auto px-4 py-2 flex flex-col gap-1">
            {items.map(([to, label]) => link(to, label))}
          </div>
        </nav>
      )}
    </header>
  );
}
