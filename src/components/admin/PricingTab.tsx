import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { LoadFailed } from "@/components/app/LoadFailed";
import { Section } from "@/components/app/Section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useServerData } from "@/hooks/use-server-data";
import { supabase } from "@/integrations/supabase/client";
import { formatNaira, planDraftErrors } from "@/lib/admin-view";
import { TIER_LABEL, type Tier } from "@/lib/exam-rules";

interface Plan {
  id: string;
  name: string;
  price_ngn: number;
  duration_days: number;
  is_active: boolean;
}

async function loadPlans(): Promise<Plan[]> {
  const { data, error } = await supabase
    .from("plans")
    .select("id, name, price_ngn, duration_days, is_active")
    .in("name", ["erudite", "scholar"])
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

const planLabel = (name: string): string => TIER_LABEL[name as Tier] ?? name;

/** What each paid plan costs, how long it lasts and whether checkout offers it. */
export function PricingTab() {
  const plans = useServerData(loadPlans, []);
  const [drafts, setDrafts] = useState<Plan[]>([]);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [failedSaves, setFailedSaves] = useState(0);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (plans.data) setDrafts(plans.data);
  }, [plans.data]);

  // After a save is refused, the errors are on screen: move focus to the first field that has one.
  useEffect(() => {
    if (failedSaves > 0) form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [failedSaves]);

  const patch = (id: string, change: Partial<Plan>) =>
    setDrafts((list) => list.map((plan) => (plan.id === id ? { ...plan, ...change } : plan)));

  const saved = plans.data ?? [];
  const changed = drafts.filter((draft) => {
    const original = saved.find((plan) => plan.id === draft.id);
    return (
      original !== undefined &&
      (original.price_ngn !== draft.price_ngn ||
        original.duration_days !== draft.duration_days ||
        original.is_active !== draft.is_active)
    );
  });

  const save = async () => {
    setShowErrors(true);
    if (drafts.some((draft) => Object.keys(planDraftErrors(draft)).length > 0)) {
      setFailedSaves((count) => count + 1);
      return;
    }
    setSaving(true);
    for (const draft of changed) {
      const { error } = await supabase
        .from("plans")
        .update({
          price_ngn: draft.price_ngn,
          duration_days: draft.duration_days,
          is_active: draft.is_active,
        })
        .eq("id", draft.id);
      if (error) {
        setSaving(false);
        toast.error(error.message);
        await plans.reload();
        return;
      }
    }
    setSaving(false);
    setShowErrors(false);
    toast.success("Pricing and duration updated.");
    await plans.reload();
  };

  if (plans.error && !plans.data) return <LoadFailed load={plans} label="The plans" />;
  if (!plans.data)
    return (
      <div aria-busy="true" className="flex max-w-2xl flex-col gap-3">
        <span className="sr-only">Loading the plans</span>
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );

  return (
    <form
      ref={form}
      noValidate
      className="flex max-w-2xl flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <p className="measure text-sm text-muted-foreground">
        These values drive the student checkout screen and how long access lasts after payment.
      </p>
      {drafts.map((plan) => {
        const errors = showErrors ? planDraftErrors(plan) : {};
        return (
          <Section
            key={plan.id}
            title={planLabel(plan.name)}
            actions={
              <Badge variant={plan.is_active ? "success" : "outline"}>
                {plan.is_active ? "Shown at checkout" : "Hidden"}
              </Badge>
            }
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Price (₦)" error={errors.price}>
                {(control) => (
                  <Input
                    {...control}
                    type="number"
                    inputMode="decimal"
                    min={1}
                    value={Number.isNaN(plan.price_ngn) ? "" : plan.price_ngn}
                    onChange={(event) => patch(plan.id, { price_ngn: event.target.valueAsNumber })}
                  />
                )}
              </Field>
              <Field label="Duration (days)" error={errors.days}>
                {(control) => (
                  <Input
                    {...control}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={Number.isNaN(plan.duration_days) ? "" : plan.duration_days}
                    onChange={(event) =>
                      patch(plan.id, { duration_days: event.target.valueAsNumber })
                    }
                  />
                )}
              </Field>
            </div>
            <label className="flex items-center justify-between gap-4 text-sm font-medium">
              Show on checkout
              <Switch
                checked={plan.is_active}
                onCheckedChange={(active) => patch(plan.id, { is_active: active })}
              />
            </label>
            <p className="text-sm text-muted-foreground">
              Students will see {formatNaira(Number.isNaN(plan.price_ngn) ? 0 : plan.price_ngn)} for{" "}
              {Number.isNaN(plan.duration_days) ? 0 : plan.duration_days} days.
            </p>
          </Section>
        );
      })}
      <div>
        <Button type="submit" loading={saving} disabled={changed.length === 0}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
