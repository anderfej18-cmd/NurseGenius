import { Flag } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { QuestionPreview } from "@/components/QuestionPreview";
import { LoadFailed } from "@/components/app/LoadFailed";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { Field } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { adminListQuestionReports, resolveQuestionReport } from "@/functions/reports.functions";
import { useServerData } from "@/hooks/use-server-data";

type Status = "open" | "resolved" | "dismissed";
type Item = Awaited<ReturnType<typeof adminListQuestionReports>>["items"][number];

/** Students' reports about questions: read each with its question and key, then resolve or dismiss it. */
export function ReportsTab() {
  const [status, setStatus] = useState<Status>("open");
  const list = useServerData(
    () => adminListQuestionReports({ data: { status, limit: 25 } }),
    [status],
  );

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={status} onValueChange={(v) => setStatus(v as Status)}>
        <TabsList>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
          <TabsTrigger value="dismissed">Dismissed</TabsTrigger>
        </TabsList>
      </Tabs>
      {list.error && <LoadFailed load={list} label="The reports" />}
      {list.loading && !list.data && (
        <div aria-busy="true" className="flex flex-col gap-3">
          <span className="sr-only">Loading reports</span>
          <Skeleton className="h-56 w-full" />
        </div>
      )}
      {list.data?.items.length === 0 && (
        <EmptyState
          icon={Flag}
          title={`No ${status} reports`}
          description={
            status === "open"
              ? "When a student reports a question, it appears here."
              : "Reports you handle appear here."
          }
        />
      )}
      {list.data?.items.map((report) => (
        <ReportCard key={report.id} report={report} onHandled={() => void list.reload()} />
      ))}
      {list.data?.nextOffset != null && (
        <p className="text-sm text-muted-foreground">
          Only the newest 25 are shown. Handle some to see more.
        </p>
      )}
    </div>
  );
}

function ReportCard({ report, onHandled }: { report: Item; onHandled: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"resolved" | "dismissed" | null>(null);
  const q = report.question;

  const decide = async (outcome: "resolved" | "dismissed") => {
    setBusy(outcome);
    try {
      await resolveQuestionReport({
        data: {
          reportId: report.id,
          status: outcome,
          ...(note.trim() === "" ? {} : { note: note.trim() }),
        },
      });
      toast.success(outcome === "resolved" ? "Report resolved." : "Report dismissed.");
      onHandled();
    } catch (error) {
      toast.error((error as Error).message);
    }
    setBusy(null);
  };

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="warning" className="capitalize">
          {report.reason.replace(/_/g, " ")}
        </Badge>
        <span className="text-xs tabular-nums text-muted-foreground">
          {new Date(report.createdAt).toLocaleString()}
        </span>
      </div>
      {report.details && <p className="measure text-sm">“{report.details}”</p>}
      <QuestionPreview
        text={q.question_text}
        options={{ A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d }}
        correct={q.correct_answer}
      />
      {q.rationale && (
        <p className="measure text-sm text-muted-foreground">Rationale: {q.rationale}</p>
      )}
      {report.status === "open" ? (
        <>
          <Field label="Note for the record" hint="Optional.">
            {(control) => (
              <Textarea
                {...control}
                rows={2}
                value={note}
                maxLength={1000}
                onChange={(event) => setNote(event.target.value)}
              />
            )}
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              loading={busy === "resolved"}
              disabled={busy !== null}
              onClick={() => void decide("resolved")}
            >
              Resolve
            </Button>
            <Button
              size="sm"
              variant="outline"
              loading={busy === "dismissed"}
              disabled={busy !== null}
              onClick={() => void decide("dismissed")}
            >
              Dismiss
            </Button>
          </div>
        </>
      ) : (
        report.resolutionNote && (
          <p className="text-sm text-muted-foreground">Note: {report.resolutionNote}</p>
        )
      )}
    </Card>
  );
}
