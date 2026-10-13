import { NavLink } from "@/components/app/NavLink";
import { NAV_ICONS } from "@/components/app/nav-icons";
import { isNavItemActive, menuItemsOf, type NavGroup, type NavLocation } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/** The groups of buttons, as a list of labelled sections. Used by the sidebar and the phone's menu sheet. */
export function SidebarNav({
  groups,
  location,
  onNavigate,
  label,
}: {
  groups: readonly NavGroup[];
  location: NavLocation;
  /** Called when a button is chosen (the sheet closes itself with this). */
  onNavigate?: () => void;
  label: string;
}) {
  return (
    <nav aria-label={label} className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.id} role="group" aria-labelledby={`nav-group-${group.id}`}>
          <p
            id={`nav-group-${group.id}`}
            className="px-3 pb-1.5 text-xs font-medium text-muted-foreground"
          >
            {group.label}
          </p>
          <ul className="flex flex-col gap-0.5">
            {menuItemsOf(group).map((item) => {
              const active = isNavItemActive(item, location);
              const Icon = NAV_ICONS[item.id];
              return (
                <li key={item.id}>
                  <NavLink
                    item={item}
                    active={active}
                    onClick={onNavigate}
                    title={item.description}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 ease-out focus-ring pointer-coarse:min-h-11",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                    )}
                  >
                    {Icon && <Icon aria-hidden="true" className="size-4 shrink-0" />}
                    {item.label}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
