import { Bookmark, BookmarkCheck, Flag } from "lucide-react";
import { useState } from "react";
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
import { Field } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

/** Bookmark and report buttons for one finished question; reporting opens a short form in a dialog. */
export function QuestionActions({ questionId }: { questionId: string }) {
  const [bookmarked, setBookmarked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<ReportReason>("incorrect_answer");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  const bookmark = async () => {
    setSaving(true);
    try {
      await addBookmark({ data: { questionId } });
      setBookmarked(true);
      toast.success("Bookmarked.");
    } catch (error) {
      toast.error((error as Error).message);
    }
    setSaving(false);
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
      <Button
        size="sm"
        variant="outline"
        disabled={bookmarked}
        loading={saving}
        onClick={() => void bookmark()}
      >
        {bookmarked ? <BookmarkCheck /> : <Bookmark />}
        {bookmarked ? "Bookmarked" : "Bookmark"}
      </Button>
      <Button size="sm" variant="outline" onClick={() => setReporting(true)}>
        <Flag />
        Report
      </Button>

      <Dialog open={reporting} onOpenChange={setReporting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report this question</DialogTitle>
            <DialogDescription>
              Tell us what is wrong so an administrator can check it.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <Field label="What is wrong?">
              {({ id, ...rest }) => (
                <Select value={reason} onValueChange={(value) => setReason(value as ReportReason)}>
                  <SelectTrigger id={id} {...rest}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REPORT_REASONS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {REASON_TEXT[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
            <Field label="More detail" hint="Optional. Up to 1,000 characters.">
              {(control) => (
                <Textarea
                  {...control}
                  maxLength={1000}
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                />
              )}
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReporting(false)}>
              Cancel
            </Button>
            <Button loading={busy} onClick={() => void report()}>
              Send report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
