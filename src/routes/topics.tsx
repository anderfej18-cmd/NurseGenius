import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SignedInPage } from "@/components/SignedInPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getTopicMastery } from "@/functions/intelligence.functions";
import { useAuth } from "@/hooks/use-auth";
import { useServerData } from "@/hooks/use-server-data";
import { masteryLevelText } from "@/lib/progress-view";
import { fetchTopicCounts } from "@/hooks/topic-data";

export const Route = createFileRoute("/topics")({
  component: Topics,
  head: () => ({
    meta: [
      { title: "Topics — NurseGenius" },
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
    <>
      <Tabs value={examType} onValueChange={(v) => setExamType(v === "RM" ? "RM" : "RN")}>
        <TabsList>
          <TabsTrigger value="RN">RN</TabsTrigger>
          <TabsTrigger value="RM">RM</TabsTrigger>
        </TabsList>
      </Tabs>
      {counts.error && (
        <Card className="p-5 space-y-2">
          <p className="text-destructive text-sm">{counts.error}</p>
          <Button size="sm" variant="outline" onClick={() => void counts.reload()}>
            Try again
          </Button>
        </Card>
      )}
      {counts.loading && !counts.data && <p className="text-muted-foreground text-sm">Loading…</p>}
      {counts.data && topics.length === 0 && (
        <Card className="p-5 text-sm text-muted-foreground">
          There are no {examType} questions yet.
        </Card>
      )}
      {topics.length > 0 && (
        <Card className="p-2">
          <ul className="divide-y">
            {topics.map(([topic, total]) => {
              const level = levels.get(topic);
              return (
                <li key={topic} className="flex items-center justify-between gap-3 px-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{topic}</p>
                    <p className="text-xs text-muted-foreground">
                      {total} {total === 1 ? "question" : "questions"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {level && level !== "insufficient_data" && (
                      <Badge variant="secondary">{masteryLevelText(level)}</Badge>
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
      {mastery.error && <p className="text-xs text-muted-foreground">{mastery.error}</p>}
    </>
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
