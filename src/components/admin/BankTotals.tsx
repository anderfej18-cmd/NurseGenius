import { Badge } from "@/components/ui/badge";

type Counts = Readonly<Record<string, number>>;

const total = (counts: Counts): number => Object.values(counts).reduce((sum, n) => sum + n, 0);

function Breakdown({ exam, label, counts }: { exam: "RN" | "RM"; label: string; counts: Counts }) {
  const entries = Object.entries(counts).sort((x, y) => y[1] - x[1]);
  return (
    <section aria-label={label} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Badge variant={exam === "RN" ? "rn" : "rm"}>{exam}</Badge>
          {label}
        </h3>
        <span className="text-sm font-medium tabular-nums">{total(counts).toLocaleString()}</span>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No questions yet.</p>
      ) : (
        <ul className="divide-y divide-divider">
          {entries.map(([topic, count]) => (
            <li key={topic} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <span className="min-w-0 truncate text-muted-foreground">{topic}</span>
              <span className="tabular-nums">{count.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** What is in the bank now: questions in use per exam type and per subcategory (retired ones are not counted). */
export function BankTotals({ rn, rm }: { rn: Counts; rm: Counts }) {
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-3 gap-3 border-b border-divider pb-4">
        {[
          ["In use", total(rn) + total(rm)],
          ["RN", total(rn)],
          ["RM", total(rm)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</dd>
          </div>
        ))}
      </dl>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Breakdown exam="RN" label="Registered Nurse" counts={rn} />
        <Breakdown exam="RM" label="Registered Midwife" counts={rm} />
      </div>
    </div>
  );
}
