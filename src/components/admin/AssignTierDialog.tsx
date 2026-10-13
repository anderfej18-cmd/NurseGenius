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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { TIERS, tierChoiceLabel } from "@/lib/admin-view";
import { TIER_LABEL, type Tier } from "@/lib/exam-rules";

/** The default length of a plan given by hand, in days. */
const DEFAULT_DAYS = 30;

/**
 * Gives one student a plan for a number of days (0 means it never expires). The database function
 * checks that the caller is the central admin; this dialog only collects the choice and says what it did.
 */
export function AssignTierDialog({
  userId,
  name,
  onAssigned,
}: {
  userId: string;
  name: string;
  onAssigned: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [tier, setTier] = useState<Tier>("erudite");
  const [days, setDays] = useState(DEFAULT_DAYS);
  const [busy, setBusy] = useState(false);

  const daysError =
    Number.isInteger(days) && days >= 0 ? undefined : "Enter a whole number of days, 0 or more.";

  const assign = async () => {
    if (daysError) return;
    setBusy(true);
    const { error } = await supabase.rpc("assign_user_tier", {
      _user_id: userId,
      _tier: tier,
      _days: days,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      `${name} now has ${TIER_LABEL[tier]}${days > 0 ? ` for ${days} days` : " with no expiry"}.`,
    );
    setOpen(false);
    onAssigned();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Assign plan
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void assign();
          }}
        >
          <DialogHeader>
            <DialogTitle>Assign a plan to {name}</DialogTitle>
            <DialogDescription>
              This replaces their current plan straight away, without a payment.
            </DialogDescription>
          </DialogHeader>
          <Field label="Plan">
            {(control) => (
              <Select value={tier} onValueChange={(next) => setTier(next as Tier)}>
                <SelectTrigger {...control}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIERS.map((choice) => (
                    <SelectItem key={choice} value={choice}>
                      {tierChoiceLabel(choice)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label="Length in days" hint="Use 0 for no expiry." error={daysError}>
            {(control) => (
              <Input
                {...control}
                type="number"
                inputMode="numeric"
                min={0}
                value={Number.isNaN(days) ? "" : days}
                onChange={(event) => setDays(event.target.valueAsNumber)}
              />
            )}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={daysError !== undefined}>
              Assign {TIER_LABEL[tier]}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
