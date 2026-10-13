import type { ReactNode } from "react";

/** One person in a list: an initial, their username, and the actions that apply to them. */
export function PersonRow({ name, children }: { name: string; children: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <span className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground"
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 truncate font-medium">{name}</span>
      </span>
      <span className="flex flex-wrap gap-2">{children}</span>
    </li>
  );
}
