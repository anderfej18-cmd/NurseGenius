import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { BottomBar } from "@/components/app/BottomBar";
import { SidebarNav } from "@/components/app/SidebarNav";
import { TopBar } from "@/components/app/TopBar";
import { BrandMark } from "@/components/landing/PulseTrace";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { activeNavItem, navigationFor, toolbarItemsOf, type NavLocation } from "@/lib/navigation";

/**
 * The frame of the signed-in application: a sidebar on a wide screen, a top bar with a menu sheet and a
 * bottom bar on a phone. What each person sees comes from the one navigation list (`lib/navigation.ts`);
 * the server checks every action again, so hiding a button is only convenience.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, profile, isAdmin, isCentralAdmin, loading } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useRouterState({
    select: (s): NavLocation => ({
      pathname: s.location.pathname,
      search: s.location.search as NavLocation["search"],
    }),
  });

  const groups = navigationFor({
    signedIn: !!user,
    onboarded: !!profile?.onboarded,
    isAdmin,
    isCentralAdmin,
  });
  const active = activeNavItem(groups, location);
  const showBell = toolbarItemsOf(groups).some((item) => item.id === "notifications");
  // Signed in, but the profile could not be loaded: say so instead of showing an empty frame.
  const accountUnavailable = !!user && !loading && !profile;
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      <aside className="hidden border-r bg-sidebar lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <Link
          to="/dashboard"
          className="flex h-14 shrink-0 items-center gap-2.5 px-5"
          aria-label="NurseGenius dashboard"
        >
          <BrandMark className="size-8" />
          <span className="font-display text-lg font-semibold tracking-tight">NurseGenius</span>
        </Link>
        <div className="flex-1 overflow-y-auto px-3 pb-6 pt-2">
          {loading && !profile ? (
            <div className="flex flex-col gap-3 px-3 pt-2" aria-hidden="true">
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton key={index} className="h-7 w-full" />
              ))}
            </div>
          ) : (
            <SidebarNav groups={groups} location={location} label="Main" />
          )}
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        <TopBar
          groups={groups}
          active={active}
          showBell={showBell}
          accountUnavailable={accountUnavailable}
          onOpenMenu={() => setMenuOpen(true)}
        />
        <main id="main" className="flex-1 gutter pb-24 pt-6 md:pt-8 lg:pb-10">
          <div className="mx-auto w-full max-w-[1200px]">{children}</div>
        </main>
      </div>

      <BottomBar groups={groups} location={location} onOpenMenu={() => setMenuOpen(true)} />

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-[min(20rem,88vw)] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
            <SheetDescription>Everything in NurseGenius, by area.</SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <SidebarNav
              groups={groups}
              location={location}
              onNavigate={closeMenu}
              label="Main (menu)"
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
