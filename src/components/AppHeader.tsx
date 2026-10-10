import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, type ComponentPropsWithRef } from "react";
import { useAuth, TIER_LABEL } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { NotificationBell } from "@/components/NotificationBell";
import {
  activeGroupId,
  isNavItemActive,
  menuItemsOf,
  navigationFor,
  toolbarItemsOf,
  type NavItem,
  type NavLocation,
} from "@/lib/navigation";
import { Brain, ChevronDown, LogOut, Menu } from "lucide-react";

interface NavLinkProps extends Omit<ComponentPropsWithRef<"a">, "href" | "children"> {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}

/** One navigation button. The admin page takes a tab in its address; every other page takes nothing. */
function NavLink({ item, active, onNavigate, onClick, ...rest }: NavLinkProps) {
  // The menu passes its own props (focus handling, key presses) through, so they must reach the link.
  const shared = {
    ...rest,
    onClick: (event: Parameters<NonNullable<typeof onClick>>[0]) => {
      onClick?.(event);
      onNavigate?.();
    },
    "aria-current": active ? ("page" as const) : undefined,
    title: item.description,
  };
  return item.to === "/admin" ? (
    <Link to="/admin" search={item.search} {...shared}>
      {item.label}
    </Link>
  ) : (
    <Link to={item.to} {...shared}>
      {item.label}
    </Link>
  );
}

export function AppHeader() {
  const { user, profile, isAdmin, isCentralAdmin, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useRouterState({
    select: (s): NavLocation => ({
      pathname: s.location.pathname,
      search: s.location.search as NavLocation["search"],
    }),
  });
  const [open, setOpen] = useState(false);

  const groups = navigationFor({
    signedIn: !!user,
    onboarded: !!profile?.onboarded,
    isAdmin,
    isCentralAdmin,
  });
  const activeGroup = activeGroupId(groups, location);
  const hasNotifications = toolbarItemsOf(groups).some((item) => item.id === "notifications");
  // Signed in, but the profile could not be loaded: say so instead of showing an empty header.
  const accountUnavailable = !!user && !loading && !profile;

  const closeMenu = () => setOpen(false);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between gap-2 px-4">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="h-9 w-9 rounded-lg bg-hero shadow-glow flex items-center justify-center">
            <Brain className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg tracking-tight">NurseGenius</span>
        </Link>

        {loading && user && <Skeleton className="hidden lg:block h-8 w-96" />}

        {groups.length > 0 && (
          <nav aria-label="Main" className="hidden lg:flex items-center gap-1">
            {groups.map((group) => (
              <DropdownMenu key={group.id}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={
                      activeGroup === group.id
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground/70"
                    }
                  >
                    {group.label}
                    <ChevronDown className="ml-1 h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  {menuItemsOf(group).map((item) => {
                    const active = isNavItemActive(item, location);
                    return (
                      <DropdownMenuItem key={item.id} asChild>
                        <NavLink
                          item={item}
                          active={active}
                          className={`cursor-pointer ${active ? "bg-accent font-medium" : ""}`}
                        />
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-2">
          {user ? (
            <>
              {accountUnavailable && (
                <Badge variant="destructive" title="Your profile could not be loaded">
                  Account unavailable
                </Badge>
              )}
              {profile && (
                <Badge variant="secondary" className="hidden sm:inline-flex">
                  {TIER_LABEL[profile.tier]}
                </Badge>
              )}
              {hasNotifications && <NotificationBell />}
              <Button
                size="sm"
                variant="ghost"
                aria-label="Sign out"
                onClick={async () => {
                  await signOut();
                  navigate({ to: "/" });
                }}
              >
                <LogOut className="h-4 w-4" />
              </Button>
              {groups.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="lg:hidden"
                  aria-label="Open menu"
                  onClick={() => setOpen(true)}
                >
                  <Menu className="h-4 w-4" />
                </Button>
              )}
            </>
          ) : loading ? null : (
            <Button size="sm" onClick={() => navigate({ to: "/auth" })}>
              Sign In
            </Button>
          )}
        </div>
      </div>

      {groups.length > 0 && (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="w-80 overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Menu</SheetTitle>
              <SheetDescription>Everything in NurseGenius, by area.</SheetDescription>
            </SheetHeader>
            <nav aria-label="Main (mobile)" className="mt-4 space-y-4">
              {groups.map((group) => (
                <div key={group.id}>
                  <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </p>
                  <div className="flex flex-col gap-1">
                    {menuItemsOf(group).map((item) => {
                      const active = isNavItemActive(item, location);
                      return (
                        <NavLink
                          key={item.id}
                          item={item}
                          active={active}
                          onNavigate={closeMenu}
                          className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                            active
                              ? "bg-accent text-accent-foreground"
                              : "text-foreground/70 hover:text-foreground hover:bg-accent/50"
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      )}
    </header>
  );
}
