import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { submitSummaryText, type TestCounts } from "@/lib/exam-runtime";

/**
 * Asks for confirmation before a test is handed in, and says what is still open. Submitting cannot be
 * undone: the server scores the test and releases the answers, so the button names the action.
 */
export function SubmitDialog({
  open,
  onOpenChange,
  counts,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  counts: TestCounts;
  submitting: boolean;
  onSubmit: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Submit this test?</AlertDialogTitle>
          <AlertDialogDescription>
            {submitSummaryText(counts)} Once you submit, your answers are final and the correct
            answers are shown.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Keep working</AlertDialogCancel>
          <Button onClick={onSubmit} loading={submitting}>
            Submit test
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
