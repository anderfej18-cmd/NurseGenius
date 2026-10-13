import * as React from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** What a field passes to the control inside it so the label, hint and error are all announced. */
export interface FieldControlProps {
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
  "aria-required": true | undefined;
}

interface FieldProps {
  label: React.ReactNode;
  /** The control. A function so it receives the ids it must carry. */
  children: (control: FieldControlProps) => React.ReactNode;
  /** Help that is true before the person types: format, limits, what the field is for. */
  hint?: React.ReactNode;
  /** What is wrong and what to do about it. Shown next to the field, never only as a toast. */
  error?: React.ReactNode;
  required?: boolean;
  className?: string;
}

/**
 * A labelled form field: visible label above the control, hint and error below, all linked with ARIA.
 * The label is always visible (a placeholder is never the only label).
 */
export function Field({ label, children, hint, error, required, className }: FieldProps) {
  const id = React.useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="flex items-baseline gap-1">
        {label}
        {required && (
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        )}
      </Label>
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        "aria-required": required ? true : undefined,
      })}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
