import { useEffect, useState } from "react";
import { getLeaderboard } from "@/functions/leaderboard.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Board = Awaited<ReturnType<typeof getLeaderboard>>;
export type LeaderboardPeriod = Board["period"];
type Row = Board["entries"][number];

interface Props {
  period: LeaderboardPeriod;
  showActiveDays?: boolean;
  emptyMessage?: string;
  /** Refresh the board every half minute while the page is visible. */
  liveShuffle?: boolean;
}

const REFRESH_MS = 30_000;

export function LeaderboardTable({ period, showActiveDays, emptyMessage, liveShuffle }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const board = await getLeaderboard({ data: { period } });
        if (!cancelled) setRows(board.entries);
      } catch {
        // keep showing the last board; the next refresh tries again
      }
      if (!cancelled) setLoaded(true);
    };
    void load();
    if (!liveShuffle) return () => void (cancelled = true);
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [period, liveShuffle]);

  return (
    <Card className="p-2">
      {!loaded && <p className="p-6 text-center text-muted-foreground text-sm">Loading…</p>}
      {loaded && rows.length === 0 && (
        <p className="p-6 text-center text-muted-foreground text-sm">
          {emptyMessage ?? "No qualifiers yet. Attempt 100+ questions to appear on the board."}
        </p>
      )}
      {rows.length > 0 && (
        <div className="divide-y">
          <div
            className={`grid gap-2 px-3 py-2 text-xs uppercase text-muted-foreground font-medium ${showActiveDays ? "grid-cols-13" : "grid-cols-12"}`}
            style={
              showActiveDays
                ? { gridTemplateColumns: "auto 3fr 1fr 1fr 1fr 1fr" }
                : { gridTemplateColumns: "auto 3fr 1fr 1fr 1fr" }
            }
          >
            <div>#</div>
            <div>Name</div>
            <div className="text-right">Avg %</div>
            <div className="text-right">Attempted</div>
            <div className="text-right">Correct</div>
            {showActiveDays && <div className="text-right">Days</div>}
          </div>
          {rows.map((r, i) => (
            <div
              key={r.rank}
              className={`grid gap-2 items-center px-3 py-3 text-sm transition-all ${r.isYou ? "bg-primary/10 rounded" : ""}`}
              style={
                showActiveDays
                  ? { gridTemplateColumns: "auto 3fr 1fr 1fr 1fr 1fr" }
                  : { gridTemplateColumns: "auto 3fr 1fr 1fr 1fr" }
              }
            >
              <div>
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                    i === 0
                      ? "bg-warning text-warning-foreground"
                      : i === 1
                        ? "bg-muted-foreground text-background"
                        : i === 2
                          ? "bg-accent-foreground/70 text-background"
                          : "bg-muted text-foreground"
                  }`}
                >
                  {r.rank}
                </span>
              </div>
              <div className="font-medium truncate">{r.username}</div>
              <div className="text-right">
                <Badge className="bg-hero text-primary-foreground">{r.avgScore.toFixed(1)}%</Badge>
              </div>
              <div className="text-right">{r.attempted}</div>
              <div className="text-right">{r.correct}</div>
              {showActiveDays && <div className="text-right">{r.activeDays ?? "—"}/7</div>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
