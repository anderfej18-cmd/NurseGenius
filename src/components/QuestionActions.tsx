import { useState } from "react";
import { Bookmark, Flag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addBookmark } from "@/functions/bookmarks.functions";
import { createQuestionReport } from "@/functions/reports.functions";
import { REPORT_REASONS, type ReportReason } from "@/lib/report-reasons";

const REASON_TEXT: Record<ReportReason, string> = {
  incorrect_answer: "The marked answer is wrong",
  bad_question: "The question is badly written",
  duplicate: "It is a duplicate",
  unclear: "It is unclear",
  wrong_topic: "It is in the wrong topic",
  typo: "It has a typo",
  other: "Something else",
};

/** Bookmark and report buttons for one finished question. */
export function QuestionActions({ questionId }: { questionId: string }) {
  const [bookmarked, setBookmarked] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<ReportReason>("incorrect_answer");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  const bookmark = async () => {
    try {
      await addBookmark({ data: { questionId } });
      setBookmarked(true);
      toast.success("Bookmarked");
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const report = async () => {
    setBusy(true);
    try {
      await createQuestionReport({
        data: { questionId, reason, ...(details.trim() === "" ? {} : { details: details.trim() }) },
      });
      toast.success("Thank you. An administrator will look at it.");
      setReporting(false);
      setDetails("");
    } catch (error) {
      toast.error((error as Error).message);
    }
    setBusy(false);
  };

  return (
    <>
      <Button size="sm" variant="outline" disabled={bookmarked} onClick={() => void bookmark()}>
        <Bookmark className="h-4 w-4 mr-1" /> {bookmarked ? "Bookmarked" : "Bookmark"}
      </Button>
      <Button size="sm" variant="outline" onClick={() => setReporting(true)}>
        <Flag className="h-4 w-4 mr-1" /> Report
      </Button>

      <Dialog open={reporting} onOpenChange={setReporting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report this question</DialogTitle>
            <DialogDescription>
              Tell us what is wrong so an administrator can check it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor={`reason-${questionId}`}>What is wrong?</Label>
              <select
                id={`reason-${questionId}`}
                className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm"
                value={reason}
                onChange={(event) => setReason(event.target.value as ReportReason)}
              >
                {REPORT_REASONS.map((value) => (
                  <option key={value} value={value}>
                    {REASON_TEXT[value]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor={`details-${questionId}`}>More detail (optional)</Label>
              <Textarea
                id={`details-${questionId}`}
                maxLength={1000}
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReporting(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void report()}>
              {busy ? "Sending…" : "Send report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
