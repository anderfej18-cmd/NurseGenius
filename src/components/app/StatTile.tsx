import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

/**
 * One headline figure: a label in sentence case, the value in the same sans as the rest of the page
 * (proportional figures, since it stands alone), and one line saying what it rests on. A tile with
 * nothing to show says so in words; it never shows a made-up zero.
 */
export function StatTile({
  label,
  value,
  note,
  children,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-1 p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="font-sans text-3xl font-semibold leading-tight">{value}</div>
      {note && <div className="text-sm text-muted-foreground">{note}</div>}
      {children}
    </Card>
  );
}
