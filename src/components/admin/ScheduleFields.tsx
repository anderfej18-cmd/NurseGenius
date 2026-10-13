import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CUSTOM_TEST_LIMITS,
  type Schedule,
  type ScheduleErrors,
  type WindowUnit,
  windowEnd,
} from "@/lib/custom-test-form";

const when = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/**
 * When a live test opens, how long its link stays open, and how long each candidate has once they start.
 * Used when a test is created and when it is republished.
 */
export function ScheduleFields({
  value,
  onChange,
  errors,
}: {
  value: Schedule;
  onChange: (next: Schedule) => void;
  errors: ScheduleErrors;
}) {
  const end = windowEnd(value);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Opens" required error={errors.start}>
          {(control) => (
            <Input
              {...control}
              type="datetime-local"
              value={value.startsAt}
              onChange={(event) => onChange({ ...value, startsAt: event.target.value })}
            />
          )}
        </Field>
        <Field label="Link stays open for" required error={errors.window}>
          {(control) => (
            <div className="flex gap-2">
              <Input
                {...control}
                type="number"
                inputMode="decimal"
                min={0}
                className="min-w-0 flex-1"
                value={Number.isNaN(value.windowValue) ? "" : value.windowValue}
                onChange={(event) =>
                  onChange({ ...value, windowValue: event.target.valueAsNumber })
                }
              />
              <Select
                value={value.windowUnit}
                onValueChange={(unit) => onChange({ ...value, windowUnit: unit as WindowUnit })}
              >
                <SelectTrigger aria-label="Unit of time" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minutes">minutes</SelectItem>
                  <SelectItem value="hours">hours</SelectItem>
                  <SelectItem value="days">days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </Field>
        <Field
          label="Time per candidate (minutes)"
          required
          error={errors.duration}
          hint={`${CUSTOM_TEST_LIMITS.minutes.min} minutes to 3 hours`}
        >
          {(control) => (
            <Input
              {...control}
              type="number"
              inputMode="numeric"
              value={Number.isNaN(value.durationMinutes) ? "" : value.durationMinutes}
              onChange={(event) =>
                onChange({ ...value, durationMinutes: event.target.valueAsNumber })
              }
            />
          )}
        </Field>
      </div>
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {end === null
          ? "Choose a start time and how long the link stays open."
          : `The link closes ${when.format(end)}. A candidate who starts just before then still gets their full time.`}
      </p>
    </div>
  );
}
