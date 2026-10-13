import { Menu } from "lucide-react";
import { NavLink } from "@/components/app/NavLink";
import { NAV_ICONS } from "@/components/app/nav-icons";
import {
  bottomBarItemsOf,
  isNavItemActive,
  type NavGroup,
  type NavLocation,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";

const cell =
  "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-1 text-xs font-medium transition-colors duration-150 focus-ring";

/**
 * The phone's bottom bar: the four most used pages and "More", which opens the whole menu. It clears
 * the home indicator with the bottom safe-area inset. Hidden from 1024px up, where the sidebar shows.
 */
export function BottomBar({
  groups,
  location,
  onOpenMenu,
}: {
  groups: readonly NavGroup[];
  location: NavLocation;
  onOpenMenu: () => void;
}) {
  const items = bottomBarItemsOf(groups);
  return (
    <nav
      aria-label="Main"
      className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t bg-background lg:hidden"
    >
      <ul className="flex">
        {items.map((item) => {
          const active = isNavItemActive(item, location);
          const Icon = NAV_ICONS[item.id];
          return (
            <li key={item.id} className="flex flex-1">
              <NavLink
                item={item}
                active={active}
                className={cn(cell, active ? "text-primary" : "text-muted-foreground")}
              >
                {Icon && <Icon aria-hidden="true" className="size-5" />}
                <span>{item.shortLabel ?? item.label}</span>
              </NavLink>
            </li>
          );
        })}
        <li className="flex flex-1">
          <button type="button" onClick={onOpenMenu} className={cn(cell, "text-muted-foreground")}>
            <Menu aria-hidden="true" className="size-5" />
            <span>More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
