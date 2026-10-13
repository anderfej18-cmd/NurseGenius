import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A titled surface for one part of a page: a heading, an optional line under it, an optional action
 * on the right, then the content. Headings are h2 so the page's single h1 stays the page title.
 */
export function Section({
  title,
  description,
  actions,
  children,
  className,
  id,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <Card className={cn("p-5 md:p-6", className)}>
      <section id={id} aria-labelledby={headingId} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h2 id={headingId} className="font-sans text-lg font-semibold tracking-normal">
              {title}
            </h2>
            {description && (
              <p className="measure mt-1 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {actions}
        </div>
        {children}
      </section>
    </Card>
  );
}
