import { useState } from "react";
import { InsightCard } from "@/components/InsightCard";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getConfidenceAnalytics,
  getExamReadiness,
  getTimeAnalytics,
  getTopicMastery,
} from "@/functions/intelligence.functions";
import { useAuth } from "@/hooks/use-auth";
import { useServerData } from "@/hooks/use-server-data";
import { readinessReadingNote } from "@/lib/insight-view";
import { masteryLevelText, readinessBandText } from "@/lib/progress-view";

export function MasteryPanel() {
  const { profile } = useAuth();
  const preferred = profile?.exam_preference;
  const [examType, setExamType] = useState<"RN" | "RM">(preferred === "RM" ? "RM" : "RN");
  const readiness = useServerData(() => getExamReadiness({ data: { examType } }), [examType]);
  const mastery = useServerData(() => getTopicMastery({ data: {} }), []);
  const confidence = useServerData(() => getConfidenceAnalytics({ data: {} }), []);
  const time = useServerData(() => getTimeAnalytics({ data: {} }), []);

  const report = readiness.data;
  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Exam readiness</h2>
          <Tabs value={examType} onValueChange={(v) => setExamType(v === "RM" ? "RM" : "RN")}>
            <TabsList>
              <TabsTrigger value="RN">RN</TabsTrigger>
              <TabsTrigger value="RM">RM</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {readiness.error && <p className="text-destructive text-sm">{readiness.error}</p>}
        {report && (
          <>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-bold">
                {report.readinessScore === null ? "—" : Math.round(report.readinessScore)}
              </span>
              <Badge variant="secondary">{readinessBandText(report.band)}</Badge>
            </div>
            {report.readinessScore === null && (
              <p className="text-sm text-muted-foreground">
                Answer {report.attemptsToScore} more questions to get a score.
              </p>
            )}
            {report.weakTopics.length > 0 && (
              <p className="text-sm">
                <span className="font-medium">Weakest topics: </span>
                {report.weakTopics.map((topic) => topic.topic).join(", ")}
              </p>
            )}
            {report.recommendations.map((item) => (
              <p key={item.component} className="text-sm text-muted-foreground">
                {item.message}
              </p>
            ))}
            <p className="text-xs text-muted-foreground">{report.notice}</p>
            {report.history && (
              <p className="text-xs text-muted-foreground">
                Assessed {new Date(report.history.assessedAt).toLocaleString()}.
                {report.history.change !== null &&
                  ` ${report.history.change === 0 ? "Unchanged" : `${report.history.change > 0 ? "Up" : "Down"} ${Math.abs(report.history.change)} points`} since your previous assessment.`}
              </p>
            )}
            {report.readinessScore === null && (
              <p className="text-xs text-muted-foreground">{readinessReadingNote()}</p>
            )}
            <InsightCard kind="readiness" examType={examType} />
          </>
        )}
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="font-semibold">Mastery by topic</h2>
        {mastery.error && <p className="text-destructive text-sm">{mastery.error}</p>}
        {mastery.data?.topics.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Finish a test to see how you are doing by topic.
          </p>
        )}
        {mastery.data?.topics.map((topic) => (
          <div key={topic.topic} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium">{topic.topic}</span>
              <span className="text-muted-foreground">
                {masteryLevelText(topic.level)} · {topic.attempts} answered
              </span>
            </div>
            <Progress
              value={topic.score}
              aria-label={`${topic.topic} mastery ${Math.round(topic.score)} out of 100`}
            />
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          A few correct answers do not make a topic mastered: scores stay near the middle until
          there is enough evidence.
        </p>
      </Card>

      <Card className="p-5 space-y-2">
        <h2 className="font-semibold">How sure you are</h2>
        {confidence.error && <p className="text-destructive text-sm">{confidence.error}</p>}
        {confidence.data && confidence.data.overall.rated === 0 ? (
          <p className="text-sm text-muted-foreground">
            Tell us how sure you are as you answer, and this will show where you are guessing or
            overconfident.
          </p>
        ) : (
          confidence.data && (
            <ul className="text-sm space-y-1">
              <li>Sure and right: {confidence.data.overall.correctHigh}</li>
              <li>Sure but wrong: {confidence.data.overall.wrongHigh}</li>
              <li>Unsure but right: {confidence.data.overall.correctLow}</li>
              <li>Unsure and wrong: {confidence.data.overall.wrongLow}</li>
            </ul>
          )
        )}
      </Card>

      <Card className="p-5 space-y-2">
        <h2 className="font-semibold">Your pace</h2>
        {time.error && <p className="text-destructive text-sm">{time.error}</p>}
        {time.data?.overall ? (
          <p className="text-sm">
            About {Math.round(time.data.overall.medianMs / 1000)} seconds a question (median of{" "}
            {time.data.overall.count} timed answers).
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Finish a test to see your pace.</p>
        )}
        {time.data?.insights.map((insight) => (
          <p key={insight.code} className="text-sm text-muted-foreground">
            {insight.message}
          </p>
        ))}
      </Card>
    </div>
  );
}
