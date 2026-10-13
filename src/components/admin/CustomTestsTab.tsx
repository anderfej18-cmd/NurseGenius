import { FileText, RefreshCw } from "lucide-react";
import { CreateTestForm } from "@/components/admin/CreateTestForm";
import { CustomTestCard } from "@/components/admin/CustomTestCard";
import { LoadFailed } from "@/components/app/LoadFailed";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { listCustomTests } from "@/functions/custom-tests.functions";
import { useAuth } from "@/hooks/use-auth";
import { useServerData } from "@/hooks/use-server-data";

/** Create live tests and follow every one: upcoming, live and closed, with real counts and final rankings. */
export function CustomTestsTab() {
  const { isCentralAdmin } = useAuth();
  const tests = useServerData(() => listCustomTests({ data: {} }), []);

  return (
    <div className="flex flex-col gap-8">
      <CreateTestForm onCreated={() => void tests.reload()} />

      <section aria-labelledby="live-tests" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="live-tests" className="font-sans text-lg font-semibold tracking-normal">
            {isCentralAdmin ? "All live tests" : "Your live tests"}
          </h2>
          <Button
            variant="outline"
            size="sm"
            loading={tests.loading && tests.data !== null}
            onClick={() => void tests.reload()}
          >
            <RefreshCw /> Refresh
          </Button>
        </div>
        {tests.error && <LoadFailed load={tests} label="Live tests" />}
        {tests.loading && !tests.data && (
          <div aria-busy="true">
            <span className="sr-only">Loading live tests</span>
            <Skeleton className="h-48 w-full" />
          </div>
        )}
        {tests.data?.length === 0 && (
          <EmptyState
            icon={FileText}
            title="No live tests yet"
            description="A test you publish appears here, live or not, with its link and its results."
          />
        )}
        {tests.data?.map((test) => (
          <CustomTestCard
            key={test.id}
            test={test}
            showOwner={isCentralAdmin}
            onChanged={() => void tests.reload()}
          />
        ))}
      </section>
    </div>
  );
}
