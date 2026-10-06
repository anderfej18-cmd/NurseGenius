import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface LbRow {
  user_id: string;
  username: string | null;
  avg_score: number;
  attempted: number;
  correct: number;
  active_days?: number;
}

type RpcName = "get_daily_leaderboard" | "get_weekly_leaderboard";

interface Props {
  rpc: RpcName;
  currentUserId?: string | null;
  showActiveDays?: boolean;
  emptyMessage?: string;
  liveShuffle?: boolean;
}

export function LeaderboardTable({ rpc, currentUserId, showActiveDays, emptyMessage, liveShuffle }: Props) {
  const [rows, setRows] = useState<LbRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.rpc(rpc);
    if (!error && data) {
      setRows((data as Array<Record<string, unknown>>).map(r => ({
        user_id: String(r.user_id),
        username: (r.username as string | null) ?? null,
        avg_score: Number(r.avg_score) || 0,
        attempted: Number(r.attempted) || 0,
        correct: Number(r.correct) || 0,
        active_days: r.active_days != null ? Number(r.active_days) : undefined,
      })));
    }
    setLoaded(true);
  };

  useEffect(() => {
    load();
    if (!liveShuffle) return;
    const channel = supabase
      .channel(`lb-${rpc}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "exams", filter: "status=eq.completed" }, () => load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "exams" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rpc, liveShuffle]);

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
          <div className={`grid gap-2 px-3 py-2 text-xs uppercase text-muted-foreground font-medium ${showActiveDays ? "grid-cols-13" : "grid-cols-12"}`} style={showActiveDays ? { gridTemplateColumns: "auto 3fr 1fr 1fr 1fr 1fr" } : { gridTemplateColumns: "auto 3fr 1fr 1fr 1fr" }}>
            <div>#</div>
            <div>Name</div>
            <div className="text-right">Avg %</div>
            <div className="text-right">Attempted</div>
            <div className="text-right">Correct</div>
            {showActiveDays && <div className="text-right">Days</div>}
          </div>
          {rows.map((r, i) => (
            <div
              key={r.user_id}
              className={`grid gap-2 items-center px-3 py-3 text-sm transition-all ${r.user_id === currentUserId ? "bg-primary/10 rounded" : ""}`}
              style={showActiveDays ? { gridTemplateColumns: "auto 3fr 1fr 1fr 1fr 1fr" } : { gridTemplateColumns: "auto 3fr 1fr 1fr 1fr" }}
            >
              <div>
                <span className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                  i === 0 ? "bg-warning text-warning-foreground" :
                  i === 1 ? "bg-muted-foreground text-background" :
                  i === 2 ? "bg-accent-foreground/70 text-background" :
                  "bg-muted text-foreground"
                }`}>{i + 1}</span>
              </div>
              <div className="font-medium truncate">{r.username ?? "Anonymous"}</div>
              <div className="text-right">
                <Badge className="bg-hero text-primary-foreground">{r.avg_score.toFixed(1)}%</Badge>
              </div>
              <div className="text-right">{r.attempted}</div>
              <div className="text-right">{r.correct}</div>
              {showActiveDays && <div className="text-right">{r.active_days ?? "—"}/7</div>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
