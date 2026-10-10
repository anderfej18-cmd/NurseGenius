import { useState } from "react";
import { toast } from "sonner";
import { QuestionPreview } from "@/components/QuestionPreview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
    <div className="mt-4 space-y-4">
      <Tabs value={status} onValueChange={(v) => setStatus(v as Status)}>
        <TabsList>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
          <TabsTrigger value="dismissed">Dismissed</TabsTrigger>
        </TabsList>
      </Tabs>
      {list.error && <p className="text-destructive text-sm">{list.error}</p>}
      {list.loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!list.loading && !list.error && list.data?.items.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">No {status} reports.</Card>
      )}
      {list.data?.items.map((report) => (
        <ReportCard key={report.id} report={report} onHandled={() => void list.reload()} />
      ))}
      {list.data?.nextOffset != null && (
        <p className="text-xs text-muted-foreground">
          Only the newest 25 are shown. Handle some to see more.
        </p>
      )}
    </div>
  );
}

function ReportCard({ report, onHandled }: { report: Item; onHandled: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const q = report.question;

  const decide = async (outcome: "resolved" | "dismissed") => {
    setBusy(true);
    try {
      await resolveQuestionReport({
        data: {
          reportId: report.id,
          status: outcome,
          ...(note.trim() === "" ? {} : { note: note.trim() }),
        },
      });
      onHandled();
    } catch (error) {
      toast.error((error as Error).message);
    }
    setBusy(false);
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{report.reason.replace(/_/g, " ")}</Badge>
        <span className="text-xs text-muted-foreground">
          {new Date(report.createdAt).toLocaleString()}
        </span>
      </div>
      {report.details && <p className="text-sm">“{report.details}”</p>}
      <QuestionPreview
        text={q.question_text}
        options={{ A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d }}
        correct={q.correct_answer}
      />
      {q.rationale && <p className="text-sm text-muted-foreground">Rationale: {q.rationale}</p>}
      {report.status === "open" ? (
        <>
          <Textarea
            value={note}
            maxLength={1000}
            placeholder="Note for the record (optional)"
            aria-label="Resolution note"
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => void decide("resolved")}>
              Resolve
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
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
