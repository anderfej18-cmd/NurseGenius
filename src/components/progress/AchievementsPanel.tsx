import { Lock, Trophy } from "lucide-react";
import { LoadFailed } from "@/components/app/LoadFailed";
import { Section } from "@/components/app/Section";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { getGamificationSummary } from "@/functions/engagement.functions";
import { useServerData } from "@/hooks/use-server-data";

export function AchievementsPanel() {
  const summary = useServerData(() => getGamificationSummary({ data: {} }), []);
  const data = summary.data;
  return (
    <div className="flex flex-col gap-6">
      {summary.error && !data && <LoadFailed load={summary} label="Your achievements" />}
      {summary.loading && !data && !summary.error && <Skeleton className="h-32 w-full" />}
      {data && (
        <Section
          title={`Level ${data.level.level}`}
          actions={
            <span className="text-sm text-muted-foreground tabular-nums">{data.totalXp} XP</span>
          }
        >
          <Progress value={data.level.progress * 100} aria-label="Progress to the next level" />
          <p className="text-sm text-muted-foreground">
            {data.level.xpForNextLevel === null
              ? "You have reached the top level."
              : `${data.level.xpIntoLevel} of ${data.level.xpForNextLevel} XP to the next level.`}{" "}
            XP is awarded by the server for finished tests; it cannot be set from the app.
          </p>
        </Section>
      )}
      {data && (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {data.achievements.map((achievement) => (
            <li key={achievement.code}>
              <Card className="flex h-full flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={
                      achievement.unlocked
                        ? "flex size-9 shrink-0 items-center justify-center rounded-md bg-mark text-mark-foreground"
                        : "flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
                    }
                  >
                    {achievement.unlocked ? (
                      <Trophy className="size-4" />
                    ) : (
                      <Lock className="size-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{achievement.title}</p>
                    <p className="text-sm text-muted-foreground">{achievement.description}</p>
                  </div>
                  <Badge
                    variant={achievement.unlocked ? "success" : "outline"}
                    className="shrink-0 tabular-nums"
                  >
                    {achievement.unlocked
                      ? "Unlocked"
                      : `${achievement.current} / ${achievement.target}`}
                  </Badge>
                </div>
                {!achievement.unlocked && (
                  <Progress
                    value={achievement.progress * 100}
                    aria-label={`${achievement.title}: ${achievement.current} of ${achievement.target}`}
                  />
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
