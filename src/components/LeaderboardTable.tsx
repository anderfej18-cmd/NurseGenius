import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { getLeaderboard } from "@/functions/leaderboard.functions";
import { cn } from "@/lib/utils";

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

/**
 * The ranked students for a period, as a real table so a screen reader can move by row and column. The
 * database ranks and bounds the rows; this only shows them. The student's own row says "You" in words,
 * not only with a tint. If a refresh fails the last board stays on screen and the next refresh tries again.
 */
export function LeaderboardTable({ period, showActiveDays, emptyMessage, liveShuffle }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const board = await getLeaderboard({ data: { period } });
        if (!cancelled) {
          setRows(board.entries);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
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
  }, [period, liveShuffle, attempt]);

  if (!loaded)
    return (
      <div aria-busy="true" className="flex flex-col gap-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );

  if (rows.length === 0 && failed)
    return (
      <EmptyState
        title="The leaderboard could not be loaded"
        description="Check your connection and try again."
        action={<Button onClick={() => setAttempt((n) => n + 1)}>Try again</Button>}
      />
    );

  if (rows.length === 0)
    return (
      <EmptyState
        icon={Trophy}
        title="No qualifiers yet"
        description={emptyMessage ?? "Attempt 100 or more questions to appear on the board."}
      />
    );

  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">
          {period === "daily" ? "Today's ranking" : "This week's ranking"}
        </caption>
        <thead>
          <tr className="border-b border-divider text-left text-xs text-muted-foreground">
            <th scope="col" className="w-14 px-4 py-3 font-medium">
              Rank
            </th>
            <th scope="col" className="px-2 py-3 font-medium">
              Name
            </th>
            <th scope="col" className="px-2 py-3 text-right font-medium">
              Average
            </th>
            <th scope="col" className="px-2 py-3 text-right font-medium max-sm:hidden">
              Attempted
            </th>
            <th scope="col" className="px-2 py-3 text-right font-medium max-sm:hidden">
              Correct
            </th>
            {showActiveDays && (
              <th scope="col" className="px-2 py-3 text-right font-medium">
                Days
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.rank}
              className={cn("border-b border-divider last:border-0", row.isYou && "bg-accent")}
            >
              <td className="px-4 py-3">
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                    index < 3 ? "bg-mark text-mark-foreground" : "bg-muted text-foreground",
                  )}
                >
                  {row.rank}
                </span>
              </td>
              <td className="max-w-0 px-2 py-3">
                <span className="flex items-center gap-2">
                  <span className="min-w-0 truncate font-medium">{row.username}</span>
                  {row.isYou && (
                    <Badge variant="secondary" className="shrink-0 max-sm:hidden">
                      You
                    </Badge>
                  )}
                </span>
                <span className="block text-xs text-muted-foreground sm:hidden">
                  {row.isYou && "You · "}
                  {row.attempted} attempted · {row.correct} correct
                </span>
              </td>
              <td className="px-2 py-3 text-right font-semibold tabular-nums">
                {row.avgScore.toFixed(1)}%
              </td>
              <td className="px-2 py-3 text-right tabular-nums max-sm:hidden">{row.attempted}</td>
              <td className="px-2 py-3 text-right tabular-nums max-sm:hidden">{row.correct}</td>
              {showActiveDays && (
                <td className="px-2 py-3 text-right tabular-nums">{row.activeDays ?? "—"}/7</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
