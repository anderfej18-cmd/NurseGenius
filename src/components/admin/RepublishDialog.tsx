import { useState } from "react";
import { toast } from "sonner";
import { Link2 } from "lucide-react";
import { ScheduleFields } from "@/components/admin/ScheduleFields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { republishCustomTest } from "@/functions/custom-tests.functions";
import {
  type Schedule,
  defaultSchedule,
  hasErrors,
  validateSchedule,
  windowEnd,
} from "@/lib/custom-test-form";

/**
 * Gives a closed test a new schedule, a new time per candidate and a new private link. The old link stops
 * working. The questions and earlier results are untouched.
 */
export function RepublishDialog({
  testId,
  title,
  durationMinutes,
  onRepublished,
}: {
  testId: string;
  title: string;
  durationMinutes: number;
  onRepublished: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [schedule, setSchedule] = useState<Schedule>(() => ({
    ...defaultSchedule(new Date()),
    durationMinutes,
  }));
  const [busy, setBusy] = useState(false);
  const errors = validateSchedule(schedule, new Date());

  const republish = async () => {
    const end = windowEnd(schedule);
    if (hasErrors(errors) || end === null) return;
    setBusy(true);
    try {
      await republishCustomTest({
        data: {
          testId,
          startsAt: new Date(schedule.startsAt).toISOString(),
          expiresAt: end.toISOString(),
          durationMinutes: schedule.durationMinutes,
        },
      });
      toast.success("The test is live again with a new link.");
      setOpen(false);
      onRepublished();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not republish this test.");
    }
    setBusy(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (next) setSchedule({ ...defaultSchedule(new Date()), durationMinutes });
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Link2 /> Republish
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void republish();
          }}
        >
          <DialogHeader>
            <DialogTitle>Republish “{title}”</DialogTitle>
            <DialogDescription>
              Set a new schedule. This makes a new private link; the previous link stops working.
            </DialogDescription>
          </DialogHeader>
          <ScheduleFields value={schedule} onChange={setSchedule} errors={errors} />
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={hasErrors(errors)}>
              Republish
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
