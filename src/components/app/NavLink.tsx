import { Link } from "@tanstack/react-router";
import type { ComponentPropsWithRef } from "react";
import type { NavItem } from "@/lib/navigation";

interface NavLinkProps extends Omit<ComponentPropsWithRef<"a">, "href"> {
  item: NavItem;
  active: boolean;
}

/** One navigation button. The admin page takes a tab in its address; every other page takes nothing. */
export function NavLink({ item, active, children, ...rest }: NavLinkProps) {
  const shared = { ...rest, "aria-current": active ? ("page" as const) : undefined };
  return item.to === "/admin" ? (
    <Link to="/admin" search={item.search} {...shared}>
      {children}
    </Link>
  ) : (
    <Link to={item.to} {...shared}>
      {children}
    </Link>
  );
}
