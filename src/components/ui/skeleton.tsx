import { cn } from "@/lib/utils";

/** A placeholder with the shape of what is loading. Give it the final element's size so nothing jumps. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
