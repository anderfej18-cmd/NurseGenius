import { Link, createFileRoute } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { useState } from "react";
import { LoadFailed } from "@/components/app/LoadFailed";
import { SignedInPage } from "@/components/SignedInPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getTopicMastery } from "@/functions/intelligence.functions";
import { useAuth } from "@/hooks/use-auth";
import { useServerData } from "@/hooks/use-server-data";
import { masteryLevelText } from "@/lib/progress-view";
import { fetchTopicCounts } from "@/hooks/topic-data";

export const Route = createFileRoute("/_app/topics")({
  component: Topics,
  head: () => ({
    meta: [
      { title: "Topics | NurseGenius" },
      { name: "description", content: "Every topic, how many questions it has, and how you do." },
    ],
  }),
});

function TopicList() {
  const { profile } = useAuth();
  const [examType, setExamType] = useState<"RN" | "RM">(
    profile?.exam_preference === "RM" ? "RM" : "RN",
  );
  const counts = useServerData(() => fetchTopicCounts(examType), [examType]);
  const mastery = useServerData(() => getTopicMastery({ data: {} }), []);
  const levels = new Map((mastery.data?.topics ?? []).map((topic) => [topic.topic, topic.level]));
  const topics = Object.entries(counts.data ?? {}).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={examType} onValueChange={(v) => setExamType(v === "RM" ? "RM" : "RN")}>
        <TabsList aria-label="Programme">
          <TabsTrigger value="RN">RN</TabsTrigger>
          <TabsTrigger value="RM">RM</TabsTrigger>
        </TabsList>
      </Tabs>
      {counts.error && !counts.data && <LoadFailed load={counts} label="The topics" />}
      {counts.loading && !counts.data && !counts.error && (
        <div aria-busy="true" className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}
      {counts.data && topics.length === 0 && (
        <EmptyState
          icon={BookOpen}
          title={`There are no ${examType} questions yet`}
          description="Topics appear here as soon as questions are added to the bank."
        />
      )}
      {topics.length > 0 && (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-divider">
            {topics.map(([topic, total]) => {
              const level = levels.get(topic);
              return (
                <li key={topic} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{topic}</p>
                    <p className="text-xs text-muted-foreground">
                      {total} {total === 1 ? "question" : "questions"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {level && level !== "insufficient_data" && (
                      <Badge variant="secondary" className="max-sm:hidden">
                        {masteryLevelText(level)}
                      </Badge>
                    )}
                    <Button asChild size="sm" variant="outline">
                      <Link
                        to="/exam/start"
                        search={{ examType, topic, selection: "adaptive" }}
                        aria-label={`Practise ${topic}`}
                      >
                        Practise
                      </Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {mastery.error && (
        <p className="text-xs text-muted-foreground">
          Your mastery levels could not be loaded, so they are not shown. {mastery.error}
        </p>
      )}
    </div>
  );
}

function Topics() {
  return (
    <SignedInPage
      title="Topics"
      description="Every topic and how many questions it has. Practise one to start a test on it."
    >
      {() => <TopicList />}
    </SignedInPage>
  );
}
