import { Link, useNavigate } from "@tanstack/react-router";
import { CreditCard, LogOut, UserRound } from "lucide-react";
import { useState } from "react";
import { ThemeControl } from "@/components/ThemeControl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TIER_LABEL, useAuth } from "@/hooks/use-auth";

/** Two letters for the account button: the person's initials, else the start of their email. */
function initialsOf(first: string | null, last: string | null, email: string | null): string {
  const fromName = `${first?.[0] ?? ""}${last?.[0] ?? ""}`.trim();
  return (fromName || email?.slice(0, 2) || "?").toUpperCase();
}

/**
 * The account button in the top bar. It opens a panel with who is signed in, the plan, the two
 * account pages, the colour theme and sign out. The theme control lives here, inside the application.
 */
export function AccountMenu() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  if (!user) return null;

  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");
  const initials = initialsOf(
    profile?.first_name ?? null,
    profile?.last_name ?? null,
    user.email ?? null,
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Account menu" className="font-semibold">
          <span aria-hidden="true" className="text-xs">
            {initials}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="flex flex-col gap-1 p-4">
          <p className="truncate font-medium">{name || user.email}</p>
          {name && <p className="truncate text-sm text-muted-foreground">{user.email}</p>}
          {profile && (
            <Badge variant="secondary" className="mt-1 w-fit">
              {TIER_LABEL[profile.tier]} plan
            </Badge>
          )}
        </div>
        <ul className="flex flex-col gap-0.5 border-t border-divider p-2">
          <li>
            <Button
              asChild
              variant="ghost"
              className="w-full justify-start"
              onClick={() => setOpen(false)}
            >
              <Link to="/profile">
                <UserRound />
                Profile
              </Link>
            </Button>
          </li>
          <li>
            <Button
              asChild
              variant="ghost"
              className="w-full justify-start"
              onClick={() => setOpen(false)}
            >
              <Link to="/payments">
                <CreditCard />
                Upgrade
              </Link>
            </Button>
          </li>
        </ul>
        <div className="flex flex-col gap-2 border-t border-divider p-4">
          <p className="text-xs font-medium text-muted-foreground">Appearance</p>
          <ThemeControl className="w-full [&>button]:flex-1" />
        </div>
        <div className="border-t border-divider p-2">
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={async () => {
              setOpen(false);
              await signOut();
              navigate({ to: "/" });
            }}
          >
            <LogOut />
            Sign out
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
