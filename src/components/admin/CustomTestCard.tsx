import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ImportQuestionsDialog } from "@/components/admin/ImportQuestionsDialog";
import { RepublishDialog } from "@/components/admin/RepublishDialog";
import { ShareLink } from "@/components/admin/ShareLink";
import type { listCustomTests } from "@/functions/custom-tests.functions";

export type CustomTest = Awaited<ReturnType<typeof listCustomTests>>[number];

const when = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const STATE_LABEL = { upcoming: "Upcoming", live: "Live", closed: "Closed" } as const;
const STATE_VARIANT = { upcoming: "info", live: "success", closed: "outline" } as const;

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * One live test: its state and schedule, its link, how candidates did, and what can be done next. Rankings
 * appear once the test has closed; before that only the counts do.
 */
export function CustomTestCard({
  test,
  showOwner,
  onChanged,
}: {
  test: CustomTest;
  /** The central admin sees every admin's tests, so each says whose it is. */
  showOwner: boolean;
  onChanged: () => void;
}) {
  const stats = test.analytics;
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words font-sans text-base font-semibold tracking-normal">
            {test.title}
          </h3>
          <p className="text-sm text-muted-foreground">
            {test.exam_type} · {test.question_count} questions · {test.duration_minutes} minutes
            each · {test.source_mode === "upload" ? "Uploaded file" : "Question bank"}
          </p>
          <p className="text-xs tabular-nums text-muted-foreground">
            Opens {when.format(new Date(test.starts_at))} · closes{" "}
            {when.format(new Date(test.expires_at))}
          </p>
          {showOwner && (
            <p className="text-xs text-muted-foreground">
              Created by {test.owner_username ?? "an admin without a username"}
            </p>
          )}
        </div>
        <Badge variant={STATE_VARIANT[test.state]}>{STATE_LABEL[test.state]}</Badge>
      </div>

      {test.share_token && test.state !== "closed" && <ShareLink token={test.share_token} />}

      <dl className="grid grid-cols-2 gap-3 border-y border-divider py-3 sm:grid-cols-4">
        <Figure label="Participants" value={String(stats.participant_count)} />
        <Figure label="Passed (50% or more)" value={String(stats.pass_count)} />
        <Figure label="Failed" value={String(stats.fail_count)} />
        <Figure
          label="Pass rate · average"
          value={`${stats.pass_pct}% · ${stats.average_score}%`}
        />
      </dl>

      {test.state !== "closed" ? (
        <p className="text-sm text-muted-foreground">Rankings appear here once the link closes.</p>
      ) : test.attempts.length > 0 ? (
        <div>
          <h4 className="mb-2 text-sm font-medium">Final ranking</h4>
          <ol className="divide-y divide-divider border-y border-divider">
            {test.attempts.map((attempt, index) => (
              <li key={attempt.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  <span className="tabular-nums text-muted-foreground">{index + 1}.</span>{" "}
                  {attempt.email}
                </span>
                <span className="shrink-0 font-medium tabular-nums">{attempt.score_pct ?? 0}%</span>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Nobody finished this test.</p>
      )}

      <div className="flex flex-wrap gap-2">
        {test.state === "closed" && (
          <RepublishDialog
            testId={test.id}
            title={test.title}
            durationMinutes={test.duration_minutes}
            onRepublished={onChanged}
          />
        )}
        {test.custom_unimported > 0 && (
          <ImportQuestionsDialog
            testId={test.id}
            title={test.title}
            pending={test.custom_unimported}
            defaultExamType={test.exam_type}
            onImported={onChanged}
          />
        )}
      </div>
    </Card>
  );
}
