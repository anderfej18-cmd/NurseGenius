import type { ReactNode } from "react";
import { LeaderboardTable } from "@/components/LeaderboardTable";

function Board({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-sans text-lg font-semibold tracking-normal">{title}</h2>
        <p className="measure mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

/** The two rankings students see, side by side for admins: today's live board and the week's. */
export function LeaderboardsTab() {
  return (
    <div className="flex flex-col gap-8">
      <Board
        title="Daily leaderboard"
        description="Live view. A student needs 100 or more questions today to qualify. Ranked by average score, with ties broken by more questions attempted."
      >
        <LeaderboardTable period="daily" liveShuffle />
      </Board>
      <Board
        title="Weekly performance board"
        description="Monday to Sunday (UTC). A student needs 100 or more questions on at least 4 of 7 days. It resets on Monday at 00:00 UTC."
      >
        <LeaderboardTable
          period="weekly"
          showActiveDays
          emptyMessage="No consistent qualifiers this week yet. A student needs 100 or more questions on 4 of 7 days."
        />
      </Board>
    </div>
  );
}
