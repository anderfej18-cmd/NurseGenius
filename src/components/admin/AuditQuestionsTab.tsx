import { CircleCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BrokenQuestionDialog } from "@/components/admin/BrokenQuestionDialog";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { LoadFailed } from "@/components/app/LoadFailed";
import { Section } from "@/components/app/Section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { adminDeleteQuestion, adminRetireQuestion } from "@/functions/questions.functions";
import { fetchAdminQuestions, type AdminQuestion } from "@/hooks/admin-questions";
import { useServerData } from "@/hooks/use-server-data";
import { auditQuestion } from "@/lib/questions";

/** Every RN and RM question, retired ones included, that is incomplete or malformed. */
async function scanForBroken(): Promise<AdminQuestion[]> {
  const [nursing, midwifery] = await Promise.all(
    (["RN", "RM"] as const).map((examType) => fetchAdminQuestions({ examType, status: "all" })),
  );
  return [...nursing, ...midwifery].filter((question) => {
    const { missing, malformed } = auditQuestion(question);
    return missing.length + malformed.length > 0;
  });
}

/** Finds questions that are incomplete or malformed; an admin edits, retires or deletes each one by hand. Nothing is repaired automatically. */
export function AuditQuestionsTab() {
  const scan = useServerData(scanForBroken, []);
  const [editing, setEditing] = useState<AdminQuestion | null>(null);
  const [retired, setRetired] = useState<ReadonlySet<string>>(new Set());
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());

  const retire = async (question: AdminQuestion): Promise<boolean> => {
    try {
      await adminRetireQuestion({ data: { questionId: question.id } });
    } catch (error) {
      toast.error((error as Error).message);
      return false;
    }
    toast.success("Question retired.");
    setRetired((current) => new Set(current).add(question.id));
    return true;
  };

  const remove = async (question: AdminQuestion): Promise<boolean> => {
    try {
      await adminDeleteQuestion({ data: { questionId: question.id } });
    } catch (error) {
      toast.error((error as Error).message);
      return false;
    }
    toast.success("Question deleted.");
    setRemoved((current) => new Set(current).add(question.id));
    return true;
  };

  const rows = (scan.data ?? []).filter((question) => !removed.has(question.id));

  return (
    <Section
      title="Audit and fix questions"
      description="Scans every RN and RM question for missing text, a missing option, an answer key that is not A to D, and options that repeat. You decide what to do with each one."
      actions={
        <Button
          variant="outline"
          size="sm"
          loading={scan.loading}
          onClick={() => void scan.reload()}
        >
          Rescan
        </Button>
      }
    >
      {scan.error && <LoadFailed load={scan} label="The scan" />}
      {scan.loading && !scan.data && (
        <div aria-busy="true" className="flex flex-col gap-3">
          <span className="sr-only">Scanning the question bank</span>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}
      {scan.data && rows.length === 0 && (
        <EmptyState
          icon={CircleCheck}
          title="No problems found"
          description="Every question has its text, four distinct options and a valid answer key."
        />
      )}
      {rows.length > 0 && (
        <>
          <p aria-live="polite" className="text-sm font-medium">
            {rows.length} {rows.length === 1 ? "question needs" : "questions need"} attention
          </p>
          <ul className="divide-y divide-divider">
            {rows.map((question) => {
              const isRetired = question.status === "retired" || retired.has(question.id);
              const { missing, malformed } = auditQuestion(question);
              return (
                <li
                  key={question.id}
                  className="flex flex-wrap items-start justify-between gap-3 py-4"
                >
                  <div className="min-w-0 flex-1 basis-64">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={question.exam_type === "RN" ? "rn" : "rm"}>
                        {question.exam_type}
                      </Badge>
                      <span className="text-sm">{question.topic || "No subcategory"}</span>
                      {isRetired && <Badge variant="outline">Retired</Badge>}
                    </div>
                    {question.question_text.trim() !== "" && (
                      <p className="mt-1 line-clamp-2 text-sm">{question.question_text}</p>
                    )}
                    {missing.length > 0 && (
                      <p className="mt-1 text-sm text-destructive">Missing: {missing.join(", ")}</p>
                    )}
                    {malformed.length > 0 && (
                      <p className="mt-1 text-sm text-warning">Check: {malformed.join("; ")}</p>
                    )}
                    <p className="mt-1 break-all text-xs text-muted-foreground">ID {question.id}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(question)}>
                      Edit
                    </Button>
                    {!isRetired && (
                      <ConfirmDialog
                        title="Retire this broken question?"
                        description="It stops being used in new tests. Tests students already took keep it, and you can restore it from the Question Bank."
                        confirmLabel="Retire question"
                        destructive
                        onConfirm={() => retire(question)}
                        trigger={(open) => (
                          <Button size="sm" variant="outline" onClick={open}>
                            Retire
                          </Button>
                        )}
                      />
                    )}
                    <ConfirmDialog
                      title="Delete this question for good?"
                      description="It is removed from the bank and cannot be restored; a copy is kept in the audit log. A question students have answered cannot be deleted. Retire it instead."
                      confirmLabel="Delete question"
                      confirmPhrase="DELETE"
                      destructive
                      onConfirm={() => remove(question)}
                      trigger={(open) => (
                        <Button size="sm" variant="outline" onClick={open}>
                          Delete
                        </Button>
                      )}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {editing && (
        <BrokenQuestionDialog
          question={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void scan.reload();
          }}
        />
      )}
    </Section>
  );
}
