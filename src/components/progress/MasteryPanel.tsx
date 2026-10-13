import { useState } from "react";
import { LoadFailed } from "@/components/app/LoadFailed";
import { Section } from "@/components/app/Section";
import { MeterList } from "@/components/charts/MeterList";
import { InsightCard } from "@/components/InsightCard";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  const overall = confidence.data?.overall;
  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Exam readiness"
        description="An estimate from your own practice. It is not a prediction of your exam result."
        actions={
          <Tabs value={examType} onValueChange={(v) => setExamType(v === "RM" ? "RM" : "RN")}>
            <TabsList aria-label="Programme">
              <TabsTrigger value="RN">RN</TabsTrigger>
              <TabsTrigger value="RM">RM</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      >
        {readiness.error && !report && <LoadFailed load={readiness} label="Your readiness" />}
        {readiness.loading && !report && !readiness.error && <Skeleton className="h-28 w-full" />}
        {report && (
          <>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="font-sans text-5xl font-semibold leading-none">
                {report.readinessScore === null ? "Not yet" : Math.round(report.readinessScore)}
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
            {report.recommendations.length > 0 && (
              <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                {report.recommendations.map((item) => (
                  <li key={item.component}>{item.message}</li>
                ))}
              </ul>
            )}
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
      </Section>

      <Section
        title="Mastery by topic"
        description="From 0 to 100. A few correct answers do not make a topic mastered: scores stay near the middle until there is enough evidence."
      >
        {mastery.error && !mastery.data && <LoadFailed load={mastery} label="Your topics" />}
        {mastery.loading && !mastery.data && !mastery.error && <Skeleton className="h-40 w-full" />}
        {mastery.data?.topics.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Finish a test to see how you are doing by topic.
          </p>
        )}
        {mastery.data && mastery.data.topics.length > 0 && (
          <MeterList
            label="Mastery by topic"
            rows={[...mastery.data.topics]
              .sort((a, b) => a.score - b.score || a.topic.localeCompare(b.topic))
              .map((topic) => ({
                key: topic.topic,
                label: topic.topic,
                value: topic.score,
                valueText: String(Math.round(topic.score)),
                status: masteryLevelText(topic.level),
                note: `${topic.attempts} answered`,
              }))}
          />
        )}
      </Section>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Section title="How sure you are">
          {confidence.error && !confidence.data && (
            <LoadFailed load={confidence} label="Your confidence" />
          )}
          {confidence.loading && !confidence.data && !confidence.error && (
            <Skeleton className="h-24 w-full" />
          )}
          {overall && overall.rated === 0 && (
            <p className="text-sm text-muted-foreground">
              Tell us how sure you are as you answer, and this will show where you are guessing or
              overconfident.
            </p>
          )}
          {overall && overall.rated > 0 && (
            <dl className="grid grid-cols-2 gap-3">
              {(
                [
                  ["Sure and right", overall.correctHigh],
                  ["Sure but wrong", overall.wrongHigh],
                  ["Unsure but right", overall.correctLow],
                  ["Unsure and wrong", overall.wrongLow],
                ] as const
              ).map(([label, count]) => (
                <div key={label} className="rounded-lg bg-sunken p-3">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="font-sans text-2xl font-semibold tabular-nums">{count}</dd>
                </div>
              ))}
            </dl>
          )}
        </Section>

        <Section title="Your pace">
          {time.error && !time.data && <LoadFailed load={time} label="Your pace" />}
          {time.loading && !time.data && !time.error && <Skeleton className="h-24 w-full" />}
          {time.data?.overall ? (
            <p className="text-sm">
              About{" "}
              <span className="font-sans text-2xl font-semibold">
                {Math.round(time.data.overall.medianMs / 1000)}
              </span>{" "}
              seconds a question (median of {time.data.overall.count} timed answers).
            </p>
          ) : (
            time.data && (
              <p className="text-sm text-muted-foreground">Finish a test to see your pace.</p>
            )
          )}
          {time.data?.insights.map((insight) => (
            <p key={insight.code} className="text-sm text-muted-foreground">
              {insight.message}
            </p>
          ))}
        </Section>
      </div>
    </div>
  );
}
