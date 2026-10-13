import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { testUrl } from "@/lib/share-token";

/** The address candidates open for a live test, with a copy button. */
export function ShareLink({ token }: { token: string }) {
  const url = testUrl(window.location.origin, token);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Test link copied.");
    } catch {
      toast.error("Could not copy the link. Select it and copy it by hand.");
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Input
        readOnly
        aria-label="Test link"
        value={url}
        className="min-w-0 flex-1 basis-56"
        onFocus={(event) => event.currentTarget.select()}
      />
      <Button variant="outline" onClick={() => void copy()}>
        <Copy /> Copy link
      </Button>
    </div>
  );
}
