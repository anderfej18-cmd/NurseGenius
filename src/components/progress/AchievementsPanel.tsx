import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getGamificationSummary } from "@/functions/engagement.functions";
import { useServerData } from "@/hooks/use-server-data";

export function AchievementsPanel() {
  const summary = useServerData(() => getGamificationSummary({ data: {} }), []);
  const data = summary.data;
  return (
    <div className="space-y-4">
      {summary.error && <p className="text-destructive text-sm">{summary.error}</p>}
      {data && (
        <Card className="p-5 space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-semibold">Level {data.level.level}</h2>
            <span className="text-sm text-muted-foreground">{data.totalXp} XP</span>
          </div>
          <Progress value={data.level.progress * 100} aria-label="Progress to the next level" />
          <p className="text-xs text-muted-foreground">
            {data.level.xpForNextLevel === null
              ? "You have reached the top level."
              : `${data.level.xpIntoLevel} of ${data.level.xpForNextLevel} XP to the next level.`}{" "}
            XP is awarded by the server for finished tests; it cannot be set from the app.
          </p>
        </Card>
      )}
      {data?.achievements.map((achievement) => (
        <Card key={achievement.code} className={`p-4 ${achievement.unlocked ? "" : "opacity-80"}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">{achievement.title}</p>
              <p className="text-sm text-muted-foreground">{achievement.description}</p>
            </div>
            <Badge variant={achievement.unlocked ? "default" : "outline"}>
              {achievement.unlocked ? "Unlocked" : `${achievement.current} / ${achievement.target}`}
            </Badge>
          </div>
          {!achievement.unlocked && (
            <Progress value={achievement.progress * 100} className="mt-2" />
          )}
        </Card>
      ))}
    </div>
  );
}
