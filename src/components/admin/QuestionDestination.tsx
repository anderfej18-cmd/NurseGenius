import { ExamTypeField } from "@/components/admin/ExamTypeField";
import { SegmentedChoice } from "@/components/admin/SegmentedChoice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { destinationTopic, type DestinationDraft } from "@/lib/admin-view";
import type { ExamType } from "@/lib/exam-type";

/** Where new questions go: an exam type and a subcategory, either one that exists or a new one. */
export function QuestionDestination({
  examType,
  onExamType,
  draft,
  onDraft,
  topics,
}: {
  examType: ExamType;
  onExamType: (value: ExamType) => void;
  draft: DestinationDraft;
  onDraft: (draft: DestinationDraft) => void;
  /** The subcategories that exist for the chosen exam type. */
  topics: readonly string[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ExamTypeField label="Major category" value={examType} onChange={onExamType} />
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium leading-none">Subcategory</span>
          <SegmentedChoice
            label="Subcategory"
            value={draft.mode}
            onChange={(mode) => onDraft({ ...draft, mode })}
            options={[
              { value: "existing", label: "Choose existing" },
              { value: "new", label: "Create new" },
            ]}
          />
        </div>
      </div>
      {draft.mode === "existing" ? (
        topics.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            There are no subcategories for {examType} yet. Choose “Create new”.
          </p>
        ) : (
          <Field label="Existing subcategory">
            {(control) => (
              <Select
                value={destinationTopic(draft, topics)}
                onValueChange={(existing) => onDraft({ ...draft, existing })}
              >
                <SelectTrigger {...control}>
                  <SelectValue placeholder="Pick one" />
                </SelectTrigger>
                <SelectContent>
                  {topics.map((topic) => (
                    <SelectItem key={topic} value={topic}>
                      {topic}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
        )
      ) : (
        <Field label="New subcategory name">
          {(control) => (
            <Input
              {...control}
              maxLength={200}
              placeholder="e.g. Maternal and child health"
              value={draft.newName}
              onChange={(event) => onDraft({ ...draft, newName: event.target.value })}
            />
          )}
        </Field>
      )}
    </div>
  );
}
