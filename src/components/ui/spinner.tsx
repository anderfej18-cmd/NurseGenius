import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** A small rotating mark for work in flight inside a control. For page-sized waits use a Skeleton. */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 aria-hidden="true" className={cn("size-4 animate-spin", className)} />;
}
