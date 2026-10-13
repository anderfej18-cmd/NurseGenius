import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A section's title and optional introduction, left aligned, with a reading-width intro. */
export function SectionHeading({
  title,
  intro,
  className,
}: {
  title: ReactNode;
  intro?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <h2 className="text-3xl font-semibold md:text-4xl">{title}</h2>
      {intro && <p className="measure text-base text-muted-foreground md:text-lg">{intro}</p>}
    </div>
  );
}
