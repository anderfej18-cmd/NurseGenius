import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { AddQuestionForm } from "@/components/admin/AddQuestionForm";
import { BankTotals } from "@/components/admin/BankTotals";
import { ImportQuestionsSection } from "@/components/admin/ImportQuestionsSection";
import { QuestionDestination } from "@/components/admin/QuestionDestination";
import { LoadFailed } from "@/components/app/LoadFailed";
import { Section } from "@/components/app/Section";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchTopicCounts } from "@/hooks/topic-data";
import { useServerData } from "@/hooks/use-server-data";
import { destinationTopic, type DestinationDraft } from "@/lib/admin-view";
import type { ExamType } from "@/lib/exam-type";

const EMPTY_DESTINATION: DestinationDraft = { mode: "existing", existing: "", newName: "" };

/** Add questions to the bank: see what is there, choose where new ones go, then import a file or add one. */
export function QuestionsTab() {
  const counts = useServerData(async () => {
    const [rn, rm] = await Promise.all([fetchTopicCounts("RN"), fetchTopicCounts("RM")]);
    return { RN: rn, RM: rm };
  }, []);
  const [examType, setExamType] = useState<ExamType>("RN");
  const [destination, setDestination] = useState(EMPTY_DESTINATION);

  const topics = Object.keys(counts.data?.[examType] ?? {}).sort();
  const topic = destinationTopic(destination, topics);

  // After questions land in a new subcategory it exists, so the picker switches to it.
  const added = async (into: string) => {
    if (destination.mode === "new")
      setDestination({ mode: "existing", existing: into, newName: "" });
    await counts.reload();
  };

  return (
    <div className="flex flex-col gap-6">
      <Section
        title="What is in the bank"
        description="Questions in use. Retired questions are not counted."
        actions={
          <Button
            size="sm"
            variant="outline"
            loading={counts.loading && counts.data !== null}
            onClick={() => void counts.reload()}
          >
            <RefreshCw /> Refresh counts
          </Button>
        }
      >
        {counts.error && <LoadFailed load={counts} label="The question counts" />}
        {!counts.data && !counts.error && (
          <div aria-busy="true" className="flex flex-col gap-3">
            <span className="sr-only">Loading the question counts</span>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}
        {counts.data && <BankTotals rn={counts.data.RN} rm={counts.data.RM} />}
      </Section>

      <Section
        title="Where new questions go"
        description="The import and the single-question form below both add to this subcategory."
      >
        <QuestionDestination
          examType={examType}
          onExamType={setExamType}
          draft={destination}
          onDraft={setDestination}
          topics={topics}
        />
      </Section>

      <ImportQuestionsSection examType={examType} topic={topic} onImported={added} />
      <AddQuestionForm examType={examType} topic={topic} onAdded={added} />
    </div>
  );
}
