import { useState, type ReactNode } from "react";
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
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/**
 * Asks before something that cannot be undone, and names the action on the confirm button. The dialog
 * stays open with a spinner while the work runs and closes when it finishes; `onConfirm` reports its own
 * failures (a toast or a message), so a failure leaves the dialog open to try again or cancel.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  destructive = false,
  confirmPhrase,
  onConfirm,
}: {
  /** The control that opens the dialog, given a function that opens it. */
  trigger: (open: () => void) => ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  /** For what cannot be undone: the person must type this exact word before the button works. */
  confirmPhrase?: string;
  onConfirm: () => Promise<boolean | void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");

  const confirm = async () => {
    setBusy(true);
    const result = await onConfirm();
    setBusy(false);
    // `false` means the work failed and already said so: keep the dialog open.
    if (result !== false) {
      setOpen(false);
      setTyped("");
    }
  };

  return (
    <>
      {trigger(() => setOpen(true))}
      <AlertDialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          {confirmPhrase && (
            <Field label={`Type ${confirmPhrase} to confirm`}>
              {(control) => (
                <Input
                  {...control}
                  autoComplete="off"
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                />
              )}
            </Field>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button
              variant={destructive ? "destructive" : "default"}
              loading={busy}
              disabled={confirmPhrase !== undefined && typed.trim() !== confirmPhrase}
              onClick={() => void confirm()}
            >
              {confirmLabel}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
