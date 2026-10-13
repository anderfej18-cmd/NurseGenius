import { Button } from "@/components/ui/button";
import type { ServerData } from "@/hooks/use-server-data";

/**
 * Said where one part of a page could not load: what failed, the server's safe message, and a retry.
 * Each part of a page loads on its own, so one failure never blanks the rest.
 */
export function LoadFailed({ load, label }: { load: ServerData<unknown>; label: string }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-destructive">
        {label} could not be loaded. {load.error}
      </p>
      <Button size="sm" variant="outline" onClick={() => void load.reload()}>
        Try again
      </Button>
    </div>
  );
}
