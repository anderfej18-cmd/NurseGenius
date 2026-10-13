import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { AccountMenu } from "@/components/app/AccountMenu";
import { BrandMark } from "@/components/landing/PulseTrace";
import { NotificationBell } from "@/components/NotificationBell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { NavGroup, NavItem } from "@/lib/navigation";

/**
 * The bar above the page. On a phone it carries the menu button and the brand; on a wide screen the
 * sidebar has the brand, so the bar shows where you are. The bell and the account menu are always here.
 */
export function TopBar({
  groups,
  active,
  showBell,
  accountUnavailable,
  onOpenMenu,
}: {
  groups: readonly NavGroup[];
  active: NavItem | null;
  showBell: boolean;
  accountUnavailable: boolean;
  onOpenMenu: () => void;
}) {
  const group = groups.find((candidate) => candidate.items.some((item) => item.id === active?.id));
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background gutter">
      {groups.length > 0 && (
        <Button
          variant="ghost"
          size="icon"
          className="-ml-2 lg:hidden"
          aria-label="Open menu"
          onClick={onOpenMenu}
        >
          <Menu />
        </Button>
      )}
      <Link
        to="/"
        className="flex items-center gap-2 rounded-md lg:hidden"
        aria-label="NurseGenius home"
      >
        <BrandMark className="size-8" />
      </Link>
      <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
        {group && active ? (
          <>
            <span className="hidden sm:inline">{group.label} / </span>
            <span className="font-medium text-foreground">{active.label}</span>
          </>
        ) : null}
      </p>
      {accountUnavailable && (
        <Badge variant="destructive" title="Your profile could not be loaded">
          Account unavailable
        </Badge>
      )}
      {showBell && <NotificationBell />}
      <AccountMenu />
    </header>
  );
}
