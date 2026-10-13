import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The landing page's 1240px column with the fluid page gutter. */
export function Container({
  as: Tag = "div",
  className,
  children,
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
}) {
  return <Tag className={cn("mx-auto w-full max-w-[1240px] gutter", className)}>{children}</Tag>;
}
